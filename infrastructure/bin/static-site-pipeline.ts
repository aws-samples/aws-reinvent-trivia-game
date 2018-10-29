#!/usr/bin/env node
import codebuild = require('@aws-cdk/aws-codebuild');
import codepipeline = require('@aws-cdk/aws-codepipeline');
import codepipelineApi = require('@aws-cdk/aws-codepipeline-api');
import iam = require('@aws-cdk/aws-iam');
import cdk = require('@aws-cdk/cdk');

class TriviaGameStaticSitePipeline extends cdk.Stack {
    constructor(parent: cdk.App, name: string, props?: cdk.StackProps) {
        super(parent, name, props);

        const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
            pipelineName: 'reinvent-trivia-game-static-site',
        });

        // Source
        const githubAccessToken = new cdk.SecretParameter(this, 'GitHubToken', { ssmParameter: 'GitHubToken' });
        const source = new codepipeline.GitHubSourceAction(this, 'GitHubSource', {
            stage: pipeline.addStage('Source'),
            owner: 'clareliguori',
            repo: 'aws-reinvent-trivia-game',
            oauthToken: githubAccessToken.value
        });

        // Build
        const buildStage = pipeline.addStage('Build');
        this.addBuildAction(buildStage, 'Build', 'dev', '', source.outputArtifact);

        // Test
        const testStage = pipeline.addStage('Test');
        this.addBuildAction(testStage, 'Test', 'test', 'test.reinvent-trivia.com', source.outputArtifact);

        // Prod
        const prodStage = pipeline.addStage('Prod');
        this.addBuildAction(prodStage, 'Prod', 'prod', 'www.reinvent-trivia.com', source.outputArtifact);
    }

    private addBuildAction(stage: codepipeline.Stage, stageName: string, buildTarget: string, websiteBucket: string, input: codepipelineApi.Artifact) {
        const project = new codebuild.PipelineProject(this, stageName + 'Project', {
            buildSpec: 'static-site/buildspec.yml',
            environment: {
                buildImage: codebuild.LinuxBuildImage.UBUNTU_14_04_NODEJS_10_1_0,
                environmentVariables: {
                    'STAGE': {
                        value: buildTarget
                    },
                    'WEBSITE_BUCKET': {
                        value: websiteBucket
                    }
                }
            }
        });
        if (websiteBucket.length > 0) {
            project.addToRolePolicy(new iam.PolicyStatement()
                .addActions('s3:PutObject', 's3:ListBucket')
                .addResource('arn:aws:s3:::' + websiteBucket)
                .addResource('arn:aws:s3:::' + websiteBucket + '/*'));
        }
        new codebuild.PipelineBuildAction(this, 'Webpack' + stageName, {
            stage,
            project,
            inputArtifact: input
        });
    }
}

const app = new cdk.App();
new TriviaGameStaticSitePipeline(app, 'TriviaGameStaticSitePipeline');
app.run();