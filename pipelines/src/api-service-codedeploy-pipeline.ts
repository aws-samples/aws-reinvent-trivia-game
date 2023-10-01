#!/usr/bin/env node
import { App, Fn, Stack, StackProps } from 'aws-cdk-lib';
import {
    aws_codebuild as codebuild,
    aws_codedeploy as codedeploy,
    aws_codepipeline as codepipeline,
    aws_codestarnotifications as notifications,
    aws_codepipeline_actions as actions,
    aws_ecr as ecr,
    aws_iam as iam,
} from 'aws-cdk-lib';

/**
 * Pipeline that builds a container image and deploys it to ECS using CodeDeploy blue-green deployments (no CloudFormation deployments).
 * [Sources: GitHub source, ECR base image] -> [CodeBuild build] -> [ECS (Blue/Green) Deploy Action to 'test' ECS service] -> [ECS (Blue/Green) Deploy Action to 'prod' ECS service]
 */
class TriviaGameBackendCodeDeployPipelineStack extends Stack {
    constructor(parent: App, name: string, props?: StackProps) {
        super(parent, name, props);

        const pipeline = new codepipeline.Pipeline(this, "Pipeline", {
            pipelineName: "reinvent-trivia-game-trivia-backend-with-codedeploy",
            restartExecutionOnUpdate: true,
        });

        new notifications.CfnNotificationRule(this, 'PipelineNotifications', {
            name: pipeline.pipelineName,
            detailType: 'FULL',
            resource: pipeline.pipelineArn,
            eventTypeIds: [ 'codepipeline-pipeline-pipeline-execution-failed' ],
            targets: [
                {
                    targetType: 'SNS',
                    targetAddress: Stack.of(this).formatArn({
                        service: 'sns',
                        resource: 'reinvent-trivia-notifications'
                    }),
                }
            ]
        });

        // Source
        const githubConnection = Fn.importValue('TriviaGamePipelinesCodeStarConnection');
        const sourceOutput = new codepipeline.Artifact('SourceArtifact');
        const sourceAction = new actions.CodeStarConnectionsSourceAction({
            actionName: 'GitHubSource',
            owner: 'aws-samples',
            repo: 'aws-reinvent-trivia-game',
            connectionArn: githubConnection,
            output: sourceOutput
        });

        const baseImageRepo = ecr.Repository.fromRepositoryName(this, 'BaseRepo', 'reinvent-trivia-backend-base');
        const baseImageOutput = new codepipeline.Artifact('BaseImage');
        const dockerImageSourceAction = new actions.EcrSourceAction({
          actionName: 'BaseImage',
          repository: baseImageRepo,
          imageTag: 'release',
          output: baseImageOutput,
        });

        pipeline.addStage({
            stageName: 'Source',
            actions: [sourceAction, dockerImageSourceAction],
        });

        // Update pipeline
        // This pipeline stage uses CodeBuild to self-mutate the pipeline by re-deploying the pipeline's CDK code
        // If the pipeline changes, it will automatically start again
        const pipelineProject = new codebuild.PipelineProject(this, "UpdatePipeline", {
            buildSpec: codebuild.BuildSpec.fromObjectToYaml({
                version: '0.2',
                phases: {
                    install: {
                        'runtime-versions': {
                            nodejs: 'latest',
                        },
                        commands: [
                            'npm install -g aws-cdk',
                        ],
                    },
                    build: {
                        commands: [
                            'cd $CODEBUILD_SRC_DIR/pipelines',
                            'npm ci',
                            'npm run build',
                            "cdk deploy --app 'node src/api-service-codedeploy-pipeline.js' --require-approval=never",
                        ]
                    },
                },
            }),
            environment: {
                buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_5,
            },
        });
        pipelineProject.addToRolePolicy(
          new iam.PolicyStatement({
            actions: [
              "cloudformation:*",
              "codebuild:*",
              "codepipeline:*",
              "s3:*",
              "kms:*",
              "codestar-notifications:*",
              "codestar-connections:*",
              "iam:*",
              "events:*",
              "ssm:*",
            ],
            resources: ["*"],
          })
        );
        const pipelineBuildAction = new actions.CodeBuildAction({
            actionName: 'DeployPipeline',
            project: pipelineProject,
            input: sourceOutput,
        });
        pipeline.addStage({
            stageName: 'SyncPipeline',
            actions: [pipelineBuildAction],
        });

        // Build
        const buildProject = new codebuild.PipelineProject(this, 'BuildProject', {
            buildSpec: codebuild.BuildSpec.fromSourceFilename('trivia-backend/infra/codedeploy-blue-green/buildspec.yml'),
            environment: {
              buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_5,
              privileged: true
            }
        });

        buildProject.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                'cloudformation:DescribeStackResources'
            ],
            resources: ['*']
        }));

        buildProject.addToRolePolicy(new iam.PolicyStatement({
            actions: ["ecr:GetAuthorizationToken",
                "ecr:BatchCheckLayerAvailability",
                "ecr:GetDownloadUrlForLayer",
                "ecr:GetRepositoryPolicy",
                "ecr:DescribeRepositories",
                "ecr:ListImages",
                "ecr:DescribeImages",
                "ecr:BatchGetImage",
                "ecr:InitiateLayerUpload",
                "ecr:UploadLayerPart",
                "ecr:CompleteLayerUpload",
                "ecr:PutImage"
            ],
            resources: ["*"]
        }));

        const buildArtifact = new codepipeline.Artifact('BuildArtifact');
        const imageDetailsArtifact = new codepipeline.Artifact('ImageDetails');
        const buildAction = new actions.CodeBuildAction({
            actionName: 'CodeBuild',
            project: buildProject,
            input: sourceOutput,
            extraInputs: [baseImageOutput],
            outputs: [buildArtifact, imageDetailsArtifact],
          });

        pipeline.addStage({
            stageName: 'Build',
            actions: [buildAction],
        });

        // Deploy
        this.addDeployStage(pipeline, 'Test', buildArtifact, imageDetailsArtifact);
        this.addDeployStage(pipeline, 'Prod', buildArtifact, imageDetailsArtifact);
    }

    private addDeployStage(pipeline: codepipeline.Pipeline,
        stageName: string,
        buildOutput: codepipeline.Artifact,
        imageDetailsOutput: codepipeline.Artifact) {
        const deploymentGroup = codedeploy.EcsDeploymentGroup.fromEcsDeploymentGroupAttributes(
            pipeline, 'CodeDeployDeploymentGroup' + stageName, {
                application: codedeploy.EcsApplication.fromEcsApplicationName(
                    pipeline,
                    'CodeDeployApplication' + stageName,
                    'AppECS-TriviaBackend' + stageName
                ),
                deploymentGroupName: 'DgpECS-TriviaBackend' + stageName,
                deploymentConfig: codedeploy.EcsDeploymentConfig.fromEcsDeploymentConfigName(
                    pipeline,
                    'CodeDeployDeploymentConfig',
                    'CodeDeployDefault.ECSCanary10Percent15Minutes'
                )
            });

        pipeline.addStage({
            stageName,
            actions: [
                new actions.CodeDeployEcsDeployAction({
                    actionName: 'Deploy' + stageName,
                    deploymentGroup,
                    taskDefinitionTemplateFile:
                        new codepipeline.ArtifactPath(buildOutput, `task-definition-${stageName.toLowerCase()}.json`),
                    appSpecTemplateFile:
                        new codepipeline.ArtifactPath(buildOutput, `appspec-${stageName.toLowerCase()}.json`),
                    containerImageInputs: [{
                        input: imageDetailsOutput,
                        taskDefinitionPlaceholder: 'PLACEHOLDER'
                    }]
                })
            ]
        });
    }
}

const app = new App();
new TriviaGameBackendCodeDeployPipelineStack(app, 'TriviaGameBackendCodeDeployPipeline', {
    env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1' },
    tags: {
        project: "reinvent-trivia"
    }
});
app.synth();