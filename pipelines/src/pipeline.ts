#!/usr/bin/env node
import codebuild = require('@aws-cdk/aws-codebuild');
import codepipeline = require('@aws-cdk/aws-codepipeline');
import actions = require('@aws-cdk/aws-codepipeline-actions');
import iam = require('@aws-cdk/aws-iam');
import cdk = require('@aws-cdk/core');

export interface TriviaGameCfnPipelineProps {
    stackName: string;
    templateName: string;
    pipelineName: string;
    directory: string;
}

export class TriviaGameCfnPipeline extends cdk.Construct {
    public readonly pipeline: codepipeline.Pipeline;

    public readonly sourceOutput: codepipeline.Artifact;

    constructor(parent: cdk.Construct, name: string, props: TriviaGameCfnPipelineProps) {
        super(parent, name);

        const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
            pipelineName: 'reinvent-trivia-game-' + props.pipelineName,
        });
        this.pipeline = pipeline;

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
        pipeline.addStage({
            stageName: 'Source',
            actions: [sourceAction],
        });
        this.sourceOutput = sourceOutput;

        // Build
        const buildProject = new codebuild.Project(this, 'BuildProject', {
            source: codebuild.Source.gitHub({
                owner: 'aws-samples',
                repo: 'aws-reinvent-2018-trivia-game'
            }),
            buildSpec: codebuild.BuildSpec.fromSourceFilename(props.directory + '/buildspec.yml'),
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
            actions: ['ec2:DescribeAvailabilityZones', 'route53:ListHostedZonesByName'],
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
            outputs: [buildArtifact],
          });

        pipeline.addStage({
            stageName: 'Build',
            actions: [buildAction],
        });

        // Test
        const templatePrefix =  'TriviaGame' + props.templateName;
        const testStackName = 'TriviaGame' + props.stackName + 'Test';
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
                    templatePath: buildArtifact.atPath(templatePrefix + 'Test.template.yaml'),
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
        const prodStackName = 'TriviaGame' + props.stackName + 'Prod';

        pipeline.addStage({
            stageName: 'Prod',
            actions: [
                new actions.CloudFormationCreateReplaceChangeSetAction({
                    actionName: 'PrepareChangesProd',
                    stackName: prodStackName,
                    changeSetName,
                    runOrder: 1,
                    adminPermissions: true,
                    templatePath: buildArtifact.atPath(templatePrefix + 'Prod.template.yaml'),
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