#!/usr/bin/env node
import codebuild = require('@aws-cdk/aws-codebuild');
import codepipeline = require('@aws-cdk/aws-codepipeline');
import actions = require('@aws-cdk/aws-codepipeline-api');
import cfn = require('@aws-cdk/aws-cloudformation');
import iam = require('@aws-cdk/aws-iam');
import cdk = require('@aws-cdk/cdk');

export interface TriviaGameCfnPipelineProps {
    stackName: string;
    templateName: string;
    pipelineName: string;
    directory: string;
}

export class TriviaGameCfnPipeline extends cdk.Construct {
    public readonly pipeline: codepipeline.Pipeline;

    public readonly sourceAction: actions.SourceAction

    constructor(parent: cdk.Construct, name: string, props: TriviaGameCfnPipelineProps) {
        super(parent, name);

        const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
            pipelineName: 'reinvent-trivia-game-' + props.pipelineName,
        });
        this.pipeline = pipeline;

        pipeline.addToRolePolicy(new iam.PolicyStatement()
            .addAllResources()
            .addActions("ecr:DescribeImages"));

        // Source
        const githubAccessToken = new cdk.SecretParameter(this, 'GitHubToken', { ssmParameter: 'GitHubToken' });
        const sourceAction = new codepipeline.GitHubSourceAction(this, 'GitHubSource', {
            stage: pipeline.addStage('Source'),
            owner: 'aws-samples',
            repo: 'aws-reinvent-2018-trivia-game',
            oauthToken: githubAccessToken.value
        });
        this.sourceAction = sourceAction;

        // Build
        const buildProject = new codebuild.Project(this, 'BuildProject', {
            source: new codebuild.GitHubSource({
                cloneUrl: 'https://github.com/aws-samples/aws-reinvent-2018-trivia-game',
                oauthToken: githubAccessToken.value
            }),
            buildSpec: props.directory + '/buildspec.yml',
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
        const buildAction = buildProject.addBuildToPipeline(buildStage, 'CodeBuild');

        // Test
        const testStage = pipeline.addStage('Test');
        const templatePrefix =  'TriviaGame' + props.templateName;
        const testStackName = 'TriviaGame' + props.stackName + 'Test';
        const changeSetName = 'StagedChangeSet';

        new cfn.PipelineCreateReplaceChangeSetAction(this, 'PrepareChangesTest', {
            stage: testStage,
            stackName: testStackName,
            changeSetName,
            runOrder: 1,
            fullPermissions: true,
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
        const prodStackName = 'TriviaGame' + props.stackName + 'Prod';

        new cfn.PipelineCreateReplaceChangeSetAction(this, 'PrepareChanges', {
            stage: prodStage,
            stackName: prodStackName,
            changeSetName,
            runOrder: 1,
            fullPermissions: true,
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