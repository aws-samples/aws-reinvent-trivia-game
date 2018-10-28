#!/usr/bin/env node
import codebuild = require('@aws-cdk/aws-codebuild');
import codecommit = require('@aws-cdk/aws-codecommit');
import codepipeline = require('@aws-cdk/aws-codepipeline');
import cfn = require('@aws-cdk/aws-cloudformation');
import cdk = require('@aws-cdk/cdk');

class SharedInfrastructurePipelineStack extends cdk.Stack {
    constructor(parent: cdk.App, name: string, props?: cdk.StackProps) {
        super(parent, name, props);

        const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
            pipelineName: 'reinvent-trivia-game-shared-infrastructure',
        });

        // Source
        const repo = new codecommit.Repository(this, 'Repository' ,{
            repositoryName: 'reinvent-trivia-game-shared-infrastructure'
        });
        const sourceStage = pipeline.addStage('Source');
        repo.addToPipeline(sourceStage, 'CodeCommit');

        // Build
        const buildProject = new codebuild.Project(this, 'BuildProject', {
            source: new codebuild.CodeCommitSource(repo),
            artifacts: new codebuild.S3BucketBuildArtifacts({
                bucket: pipeline.artifactBucket,
                name: 'output.zip'
            })
        });
        const buildStage = pipeline.addStage('Build');
        const buildAction = buildProject.addBuildToPipeline(buildStage, 'CodeBuild');

        // Test
        const testStage = new codepipeline.Stage(pipeline, 'Test', { pipeline });
        const testStackName = 'reinvent-trivia-shared-infrastructure-test';
        const changeSetName = 'StagedChangeSet';

        new cfn.PipelineCreateReplaceChangeSetAction(testStage, 'PrepareChangesTest', {
            stage: testStage,
            stackName: testStackName,
            changeSetName,
            fullPermissions: true,
            templatePath: buildAction.outputArtifact.atPath('TriviaGameSharedInfraTest.template.yaml'),
        });

        new cfn.PipelineExecuteChangeSetAction(this, 'ExecuteChangesTest', {
            stage: testStage,
            stackName: testStackName,
            changeSetName,
        });

        // Prod
        const prodStage = new codepipeline.Stage(pipeline, 'Deploy', { pipeline });
        const prodStackName = 'reinvent-trivia-shared-infrastructure-prod';

        new cfn.PipelineCreateReplaceChangeSetAction(prodStage, 'PrepareChanges', {
            stage: prodStage,
            stackName: prodStackName,
            changeSetName,
            fullPermissions: true,
            templatePath: buildAction.outputArtifact.atPath('TriviaGameSharedInfraProd.template.yaml'),
        });

        new codepipeline.ManualApprovalAction(this, 'ApproveChangesProd', {
            stage: prodStage,
        });

        new cfn.PipelineExecuteChangeSetAction(this, 'ExecuteChangesProd', {
            stage: prodStage,
            stackName: prodStackName,
            changeSetName,
        });
    }
}

const app = new cdk.App();
new SharedInfrastructurePipelineStack(app, 'TriviaGameSharedInfraPipeline');
app.run();