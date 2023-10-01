#!/usr/bin/env node
import { App, Fn, Stack, StackProps } from 'aws-cdk-lib';
import {
    aws_codebuild as codebuild,
    aws_codepipeline as codepipeline,
    aws_codestarnotifications as notifications,
    aws_codepipeline_actions as actions,
    aws_iam as iam,
} from 'aws-cdk-lib';

class TriviaGameStaticSitePipeline extends Stack {
    constructor(parent: App, name: string, props?: StackProps) {
        super(parent, name, props);

        const pipeline = new codepipeline.Pipeline(this, "Pipeline", {
            pipelineName: "reinvent-trivia-game-static-site",
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
                            "cdk deploy --app 'node src/static-site-pipeline.js' --require-approval=never",
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

        // Deploy to test site
        pipeline.addStage({
            stageName: 'Test',
            actions: [this.createDeployAction('Test', sourceOutput)]
        });

        // Deploy to prod site
        pipeline.addStage({
            stageName: 'Prod',
            actions: [this.createDeployAction('Prod', sourceOutput)]
        });
    }

    private createDeployAction(stageName: string, input: codepipeline.Artifact): actions.Action {
        const project = new codebuild.PipelineProject(this, stageName + 'Project', {
            buildSpec: codebuild.BuildSpec.fromSourceFilename('static-site/buildspec.yml'),
            environment: {
                buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_5,
                environmentVariables: {
                    'STAGE': {
                        value: stageName.toLowerCase()
                    }
                }
            }
        });

        // Admin permissions needed for cdk deploy
        project.addToRolePolicy(new iam.PolicyStatement({
            actions: ['*'],
            resources: ['*']
        }));

        return new actions.CodeBuildAction({
            actionName: 'Deploy' + stageName,
            project,
            input
        });
    }
}

const app = new App();
new TriviaGameStaticSitePipeline(app, 'TriviaGameStaticSitePipeline', {
    env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1' },
    tags: {
        project: "reinvent-trivia"
    }
});
app.synth();