#!/usr/bin/env node
import codebuild = require('@aws-cdk/aws-codebuild');
import codepipeline = require('@aws-cdk/aws-codepipeline');
import notifications = require('@aws-cdk/aws-codestarnotifications');
import ecr = require('@aws-cdk/aws-ecr');
import iam = require('@aws-cdk/aws-iam');
import actions = require('@aws-cdk/aws-codepipeline-actions');
import cdk = require('@aws-cdk/core');

export interface TriviaGameCfnPipelineProps {
    stackNamePrefix: string;
    templateNamePrefix: string;
    pipelineNameSuffix: string;
    buildspecLocation: string;
}

/**
 * A common class for a pipeline that builds a container image and deploys it using a CloudFormation template.
 * [Sources: GitHub source, ECR base image] -> [CodeBuild build] -> [CloudFormation Deploy Actions to 'test' stack] -> [CloudFormation Deploy Actions to 'prod' stack]
 */
export class TriviaGameContainersCfnPipeline extends cdk.Construct {
    constructor(parent: cdk.Construct, name: string, props: TriviaGameCfnPipelineProps) {
        super(parent, name);

        const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
            pipelineName: 'reinvent-trivia-game-' + props.pipelineNameSuffix,
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

        const testStackName = props.stackNamePrefix + 'Test';
        const prodStackName = props.stackNamePrefix + 'Prod';
        const changeSetName = 'StagedChangeSet';

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
        const buildProject = new codebuild.PipelineProject(this, 'BuildProject', {
            buildSpec: codebuild.BuildSpec.fromSourceFilename(props.buildspecLocation),
            environment: {
              buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_3,
              environmentVariables: {
                'ARTIFACTS_BUCKET': {
                    value: pipeline.artifactBucket.bucketName
                }
              },
              privileged: true
            }
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
        pipeline.addStage({
            stageName: 'Test',
            actions: [
                new actions.CloudFormationCreateReplaceChangeSetAction({
                    actionName: 'PrepareChangesTest',
                    stackName: testStackName,
                    changeSetName,
                    runOrder: 1,
                    adminPermissions: true,
                    templatePath: buildArtifact.atPath(props.templateNamePrefix + 'Test.template.json'),
                    templateConfiguration: buildArtifact.atPath('StackConfig.json'),
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
        pipeline.addStage({
            stageName: 'Prod',
            actions: [
                new actions.CloudFormationCreateReplaceChangeSetAction({
                    actionName: 'PrepareChangesProd',
                    stackName: prodStackName,
                    changeSetName,
                    runOrder: 1,
                    adminPermissions: true,
                    templatePath: buildArtifact.atPath(props.templateNamePrefix + 'Prod.template.json'),
                    templateConfiguration: buildArtifact.atPath('StackConfig.json'),
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