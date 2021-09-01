#!/usr/bin/env node
import codebuild = require('@aws-cdk/aws-codebuild');
import codepipeline = require('@aws-cdk/aws-codepipeline');
import notifications = require('@aws-cdk/aws-codestarnotifications');
import actions = require('@aws-cdk/aws-codepipeline-actions');
import iam = require('@aws-cdk/aws-iam');
import cdk = require('@aws-cdk/core');

class TriviaGameStaticSitePipeline extends cdk.Stack {
    constructor(parent: cdk.App, name: string, props?: cdk.StackProps) {
        super(parent, name, props);

        const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
            pipelineName: 'reinvent-trivia-game-static-site',
        });

        new notifications.CfnNotificationRule(this, 'PipelineNotifications', {
            name: pipeline.pipelineName,
            detailType: 'FULL',
            resource: pipeline.pipelineArn,
            eventTypeIds: [ 'codepipeline-pipeline-pipeline-execution-failed' ],
            targets: [
                {
                    targetType: 'SNS',
                    targetAddress: cdk.Stack.of(this).formatArn({
                        service: 'sns',
                        resource: 'reinvent-trivia-notifications'
                    }),
                }
            ]
        });

        // Source
        const githubConnection = cdk.Fn.importValue('TriviaGamePipelinesCodeStarConnection');
        const sourceOutput = new codepipeline.Artifact('SourceArtifact');
        const sourceAction = new actions.CodeStarConnectionsSourceAction({
            actionName: 'GitHubSource',
            owner: 'aws-samples',
            repo: 'aws-reinvent-2019-trivia-game',
            connectionArn: githubConnection,
            output: sourceOutput
        });
        pipeline.addStage({
            stageName: 'Source',
            actions: [sourceAction],
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
                buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_3,
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

const app = new cdk.App();
new TriviaGameStaticSitePipeline(app, 'TriviaGameStaticSitePipeline', {
    env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1' },
    tags: {
        project: "reinvent-trivia"
    }
});
app.synth();