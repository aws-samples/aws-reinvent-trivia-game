#!/usr/bin/env node
import codebuild = require('@aws-cdk/aws-codebuild');
import codepipeline = require('@aws-cdk/aws-codepipeline');
import notifications = require('@aws-cdk/aws-codestarnotifications');
import actions = require('@aws-cdk/aws-codepipeline-actions');
import iam = require('@aws-cdk/aws-iam');
import cdk = require('@aws-cdk/core');

class TriviaGameBackendBaseImagePipeline extends cdk.Stack {
    constructor(parent: cdk.App, name: string, props?: cdk.StackProps) {
        super(parent, name, props);

        const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
            pipelineName: 'reinvent-trivia-game-base-image',
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
        const githubAccessToken = cdk.SecretValue.secretsManager('TriviaGitHubToken');
        const sourceOutput = new codepipeline.Artifact('SourceArtifact');
        const sourceAction = new actions.GitHubSourceAction({
            actionName: 'GitHubSource',
            owner: 'aws-samples',
            repo: 'aws-reinvent-2019-trivia-game',
            oauthToken: githubAccessToken,
            output: sourceOutput
        });
        pipeline.addStage({
            stageName: 'Source',
            actions: [sourceAction],
        });

        // Build
        const project = new codebuild.PipelineProject(this, 'BuildBaseImage', {
            buildSpec: codebuild.BuildSpec.fromSourceFilename('trivia-backend/base/buildspec.yml'),
            environment: {
                buildImage: codebuild.LinuxBuildImage.UBUNTU_14_04_DOCKER_17_09_0,
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

const app = new cdk.App();
new TriviaGameBackendBaseImagePipeline(app, 'TriviaGameBackendBaseImagePipeline', {
    env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1' }
});
app.synth();