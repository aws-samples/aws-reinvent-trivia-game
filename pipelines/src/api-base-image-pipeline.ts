#!/usr/bin/env node
import { App, Fn, Stack, StackProps } from 'aws-cdk-lib';
import {
    aws_codebuild as codebuild,
    aws_codepipeline as codepipeline,
    aws_codestarnotifications as notifications,
    aws_codepipeline_actions as actions,
    aws_iam as iam,
} from 'aws-cdk-lib';

/**
 * Simple two-stage pipeline to build the base image for the trivia game backend service.
 * [GitHub source] -> [CodeBuild build, pushes image to ECR]
 */
class TriviaGameBackendBaseImagePipeline extends Stack {
    constructor(parent: App, name: string, props?: StackProps) {
        super(parent, name, props);

        const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
            pipelineName: 'reinvent-trivia-game-base-image',
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
        pipeline.addStage({
            stageName: 'Source',
            actions: [sourceAction],
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
                            "cdk deploy --app 'node src/api-base-image-pipeline.js' --require-approval=never",
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
        const project = new codebuild.PipelineProject(this, 'BuildBaseImage', {
            buildSpec: codebuild.BuildSpec.fromSourceFilename('trivia-backend/base/buildspec.yml'),
            environment: {
                buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_5,
                privileged: true
            }
        });
        project.addToRolePolicy(new iam.PolicyStatement({
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

        const buildAction = new actions.CodeBuildAction({
            actionName: 'CodeBuild',
            project,
            input: sourceOutput
        });

        pipeline.addStage({
            stageName: 'Build',
            actions: [buildAction]
        });
    }
}

const app = new App();
new TriviaGameBackendBaseImagePipeline(app, 'TriviaGameBackendBaseImagePipeline', {
    env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1' },
    tags: {
        project: "reinvent-trivia"
    }
});
app.synth();
