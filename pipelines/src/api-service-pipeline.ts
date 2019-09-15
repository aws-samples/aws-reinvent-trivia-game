#!/usr/bin/env node
import codebuild = require('@aws-cdk/aws-codebuild');
import codepipeline = require('@aws-cdk/aws-codepipeline');
import actions = require('@aws-cdk/aws-codepipeline-actions');
import ecr = require('@aws-cdk/aws-ecr');
import iam = require('@aws-cdk/aws-iam');
import cdk = require('@aws-cdk/core');

class TriviaGameBackendPipelineStack extends cdk.Stack {
    constructor(parent: cdk.App, name: string, props?: cdk.StackProps) {
        super(parent, name, props);

        const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
            pipelineName: 'reinvent-trivia-game-trivia-backend-cfn-deploy',
        });

        pipeline.addToRolePolicy(new iam.PolicyStatement({
            actions: ["ecr:DescribeImages"],
            resources: ["*"]
        }));

        // Source
        const githubAccessToken = cdk.SecretValue.secretsManager('TriviaGitHubToken');
        const sourceOutput = new codepipeline.Artifact('SourceArtifact');
        const sourceAction = new actions.GitHubSourceAction({
            actionName: 'GitHubSource',
            owner: 'aws-samples',
            repo: 'aws-reinvent-2018-trivia-game',
            oauthToken: githubAccessToken,
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

        // Build
        const buildProject = new codebuild.Project(this, 'BuildProject', {
            source: codebuild.Source.gitHub({
                owner: 'aws-samples',
                repo: 'aws-reinvent-2018-trivia-game'
            }),
            buildSpec: codebuild.BuildSpec.fromSourceFilename('trivia-backend/cdk/buildspec.yml'),
            environment: {
              buildImage: codebuild.LinuxBuildImage.UBUNTU_14_04_NODEJS_10_1_0,
              environmentVariables: {
                'ARTIFACTS_BUCKET': {
                    value: pipeline.artifactBucket.bucketName
                }
              },
              privileged: true
            },
            artifacts: codebuild.Artifacts.s3({
                bucket: pipeline.artifactBucket,
                name: 'output.zip'
            })
        });

        buildProject.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                'ec2:DescribeAvailabilityZones',
                'route53:ListHostedZonesByName'
            ],
            resources: ['*']
        }));
        buildProject.addToRolePolicy(new iam.PolicyStatement({
            actions: ['ssm:GetParameter'],
            resources: [cdk.Stack.of(this).formatArn({
                service: 'ssm',
                resource: 'parameter',
                resourceName: 'CertificateArn-*'
            })]
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
        buildProject.addToRolePolicy(new iam.PolicyStatement({
            actions: ['cloudformation:DescribeStackResources'],
            resources: [cdk.Stack.of(this).formatArn({
                service: 'cloudformation',
                resource: 'stack',
                resourceName: 'Trivia*'
            })]
        }));

        const buildArtifact = new codepipeline.Artifact('BuildArtifact');
        const buildAction = new actions.CodeBuildAction({
            actionName: 'CodeBuild',
            project: buildProject,
            input: sourceOutput,
            extraInputs: [baseImageOutput],
            outputs: [buildArtifact],
          });

        pipeline.addStage({
            stageName: 'Build',
            actions: [buildAction],
        });

        // Test
        const templatePrefix =  'TriviaBackend';
        const testStackName = 'TriviaBackendTest';
        const changeSetName = 'StagedChangeSet';

        pipeline.addStage({
            stageName: 'Test',
            actions: [
                new actions.CloudFormationCreateReplaceChangeSetAction({
                    actionName: 'PrepareChangesTest',
                    stackName: testStackName,
                    changeSetName,
                    runOrder: 1,
                    adminPermissions: true,
                    templatePath: buildArtifact.atPath(templatePrefix + 'Test.template.json'),
                }),
                new actions.CloudFormationExecuteChangeSetAction({
                    actionName: 'ExecuteChangesTest',
                    stackName: testStackName,
                    changeSetName,
                    runOrder: 2
                })
            ],
        });

        // Prod
        const prodStackName = 'TriviaBackendProd';

        pipeline.addStage({
            stageName: 'Prod',
            actions: [
                new actions.CloudFormationCreateReplaceChangeSetAction({
                    actionName: 'PrepareChangesProd',
                    stackName: prodStackName,
                    changeSetName,
                    runOrder: 1,
                    adminPermissions: true,
                    templatePath: buildArtifact.atPath(templatePrefix + 'Prod.template.json'),
                }),
                new actions.CloudFormationExecuteChangeSetAction({
                    actionName: 'ExecuteChangesProd',
                    stackName: prodStackName,
                    changeSetName,
                    runOrder: 2
                })
            ],
        });
    }
}

const app = new cdk.App();
new TriviaGameBackendPipelineStack(app, 'TriviaGameBackendPipeline', {
    env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1' }
});
app.synth();