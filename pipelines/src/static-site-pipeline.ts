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
            owner: 'aws-samples',
            repo: 'aws-reinvent-2018-trivia-game',
            oauthToken: githubAccessToken.value
        });

        // Deploy to test site
        const testStage = pipeline.addStage('Test');
        this.addBuildAction(testStage, 'Test', 'dev', source.outputArtifact);

        // Deploy to prod site
        const prodStage = pipeline.addStage('Prod');
        this.addBuildAction(prodStage, 'Prod', 'prod', source.outputArtifact);
    }

    private addBuildAction(stage: codepipeline.Stage, stageName: string, buildTarget: string, input: codepipelineApi.Artifact) {
        const project = new codebuild.PipelineProject(this, stageName + 'Project', {
            buildSpec: 'static-site/buildspec.yml',
            environment: {
                buildImage: codebuild.LinuxBuildImage.UBUNTU_14_04_NODEJS_10_1_0,
                environmentVariables: {
                    'STAGE': {
                        value: buildTarget
                    }
                }
            }
        });

        // TODO scope down permissions needed for cdk deploy
        project.addToRolePolicy(new iam.PolicyStatement()
            .addAction('*')
            .addAllResources());

        new codebuild.PipelineBuildAction(this, 'Deploy' + stageName, {
            stage,
            project,
            inputArtifact: input
        });
    }
}

const app = new cdk.App();
new TriviaGameStaticSitePipeline(app, 'TriviaGameStaticSitePipeline');
app.run();