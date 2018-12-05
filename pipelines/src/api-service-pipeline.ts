#!/usr/bin/env node
import codebuild = require('@aws-cdk/aws-codebuild');
import codepipeline = require('@aws-cdk/aws-codepipeline');
import ecr = require('@aws-cdk/aws-ecr');
import cfn = require('@aws-cdk/aws-cloudformation');
import iam = require('@aws-cdk/aws-iam');
import cdk = require('@aws-cdk/cdk');

class TriviaGameBackendPipelineStack extends cdk.Stack {
    constructor(parent: cdk.App, name: string, props?: cdk.StackProps) {
        super(parent, name, props);

        const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
            pipelineName: 'reinvent-trivia-game-trivia-backend-cfn-deploy',
        });

        pipeline.addToRolePolicy(new iam.PolicyStatement()
            .addAllResources()
            .addActions("ecr:DescribeImages"));

        // Source
        const sourceStage = pipeline.addStage('Source');

        const githubAccessToken = new cdk.SecretParameter(this, 'GitHubToken', { ssmParameter: 'GitHubToken' });
        new codepipeline.GitHubSourceAction(this, 'GitHubSource', {
            stage: sourceStage,
            owner: 'aws-samples',
            repo: 'aws-reinvent-2018-trivia-game',
            oauthToken: githubAccessToken.value
        });

        const baseImageRepo = ecr.Repository.import(this, 'BaseRepo', { repositoryName: 'reinvent-trivia-backend-base' });
        const dockerImageSourceAction = new ecr.PipelineSourceAction(this, 'BaseImage', {
            stage: sourceStage,
            repository: baseImageRepo,
            outputArtifactName: 'BaseImage'
        });

        // Build
        const buildProject = new codebuild.Project(this, 'BuildProject', {
            source: new codebuild.GitHubSource({
                cloneUrl: 'https://github.com/aws-samples/aws-reinvent-2018-trivia-game',
                oauthToken: githubAccessToken.value
            }),
            buildSpec: 'trivia-backend/cdk/buildspec.yml',
            environment: {
              buildImage: codebuild.LinuxBuildImage.UBUNTU_14_04_NODEJS_10_1_0,
              environmentVariables: {
                'ARTIFACTS_BUCKET': {
                    value: pipeline.artifactBucket.bucketName
                }
              },
              privileged: true
            },
            artifacts: new codebuild.S3BucketBuildArtifacts({
                bucket: pipeline.artifactBucket,
                name: 'output.zip'
            })
        });

        buildProject.addToRolePolicy(new iam.PolicyStatement()
            .addAllResources()
            .addAction('ec2:DescribeAvailabilityZones')
            .addAction('route53:ListHostedZonesByName'));
        buildProject.addToRolePolicy(new iam.PolicyStatement()
            .addAction('ssm:GetParameter')
            .addResource(cdk.ArnUtils.fromComponents({
                service: 'ssm',
                resource: 'parameter',
                resourceName: 'CertificateArn-*'
            })));
        buildProject.addToRolePolicy(new iam.PolicyStatement()
            .addAllResources()
            .addActions("ecr:GetAuthorizationToken",
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
                "ecr:PutImage"));
        buildProject.addToRolePolicy(new iam.PolicyStatement()
            .addAction('cloudformation:DescribeStackResources')
            .addResource(cdk.ArnUtils.fromComponents({
                service: 'cloudformation',
                resource: 'stack',
                resourceName: 'Trivia*'
            })));

        const buildStage = pipeline.addStage('Build');
        const buildAction = buildProject.addToPipeline(buildStage, 'CodeBuild', {
            additionalInputArtifacts: [dockerImageSourceAction.outputArtifact]
        });

        // Test
        const testStage = pipeline.addStage('Test');
        const templatePrefix =  'TriviaBackend';
        const testStackName = 'TriviaBackendTest';
        const changeSetName = 'StagedChangeSet';

        new cfn.PipelineCreateReplaceChangeSetAction(this, 'PrepareChangesTest', {
            stage: testStage,
            stackName: testStackName,
            changeSetName,
            runOrder: 1,
            adminPermissions: true,
            templatePath: buildAction.outputArtifact.atPath(templatePrefix + 'Test.template.yaml'),
        });

        new cfn.PipelineExecuteChangeSetAction(this, 'ExecuteChangesTest', {
            stage: testStage,
            stackName: testStackName,
            changeSetName,
            runOrder: 2
        });

        // Prod
        const prodStage = pipeline.addStage('Prod');
        const prodStackName = 'TriviaBackendProd';

        new cfn.PipelineCreateReplaceChangeSetAction(this, 'PrepareChanges', {
            stage: prodStage,
            stackName: prodStackName,
            changeSetName,
            runOrder: 1,
            adminPermissions: true,
            templatePath: buildAction.outputArtifact.atPath(templatePrefix + 'Prod.template.yaml'),
        });

        new cfn.PipelineExecuteChangeSetAction(this, 'ExecuteChangesProd', {
            stage: prodStage,
            stackName: prodStackName,
            changeSetName,
            runOrder: 2
        });
    }
}

const app = new cdk.App();
new TriviaGameBackendPipelineStack(app, 'TriviaGameBackendPipeline');
app.run();