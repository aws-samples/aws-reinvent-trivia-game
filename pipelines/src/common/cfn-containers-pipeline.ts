#!/usr/bin/env node
import { Construct } from 'constructs';
import { Fn, Stack } from 'aws-cdk-lib';
import {
    aws_codebuild as codebuild,
    aws_codepipeline as codepipeline,
    aws_codestarnotifications as notifications,
    aws_codepipeline_actions as actions,
    aws_ecr as ecr,
    aws_iam as iam,
} from 'aws-cdk-lib';

export interface TriviaGameCfnPipelineProps {
    stackNamePrefix: string;
    templateNamePrefix: string;
    pipelineNameSuffix: string;
    buildspecLocation: string;
    pipelineCdkFileName: string;
}

/**
 * A common class for a pipeline that builds a container image and deploys it using a CloudFormation template.
 * [Sources: GitHub source, ECR base image] -> [CodeBuild build] -> [CloudFormation Deploy Actions to 'test' stack] -> [CloudFormation Deploy Actions to 'prod' stack]
 */
export class TriviaGameContainersCfnPipeline extends Construct {
    constructor(parent: Construct, name: string, props: TriviaGameCfnPipelineProps) {
        super(parent, name);

        const pipeline = new codepipeline.Pipeline(this, "Pipeline", {
            pipelineName: "reinvent-trivia-game-" + props.pipelineNameSuffix,
            restartExecutionOnUpdate: true,
        });

        new notifications.CfnNotificationRule(this, 'PipelineNotifications', {
            name: pipeline.pipelineName,
            detailType: 'FULL',
            resource: pipeline.pipelineArn,
            eventTypeIds: [ 'codepipeline-pipeline-pipeline-execution-failed' ],
            targets: [
                {
                    targetType: 'SNS',
                    targetAddress: Stack.of(this).formatArn({
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
        const githubConnection = Fn.importValue('TriviaGamePipelinesCodeStarConnection');
        const sourceOutput = new codepipeline.Artifact('SourceArtifact');
        const sourceAction = new actions.CodeStarConnectionsSourceAction({
            actionName: 'GitHubSource',
            owner: 'aws-samples',
            repo: 'aws-reinvent-trivia-game',
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

        // Update pipeline
        // This pipeline stage uses CodeBuild to self-mutate the pipeline by re-deploying the pipeline's CDK code
        // If the pipeline changes, it will automatically start again
        const pipelineProject = new codebuild.PipelineProject(this, "UpdatePipeline", {
            buildSpec: codebuild.BuildSpec.fromObjectToYaml({
                version: '0.2',
                phases: {
                    install: {
                        'runtime-versions': {
                            nodejs: 'latest',
                        },
                        commands: [
                            'npm install -g aws-cdk',
                        ],
                    },
                    build: {
                        commands: [
                            'cd $CODEBUILD_SRC_DIR/pipelines',
                            'npm ci',
                            'npm run build',
                            `cdk deploy --app 'node src/${props.pipelineCdkFileName}.js' --require-approval=never`,
                        ]
                    },
                },
            }),
            environment: {
                buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_5,
            },
        });
        pipelineProject.addToRolePolicy(
          new iam.PolicyStatement({
            actions: [
              "cloudformation:*",
              "codebuild:*",
              "codepipeline:*",
              "s3:*",
              "kms:*",
              "codestar-notifications:*",
              "codestar-connections:*",
              "iam:*",
              "events:*",
              "ssm:*",
            ],
            resources: ["*"],
          })
        );
        const pipelineBuildAction = new actions.CodeBuildAction({
            actionName: 'DeployPipeline',
            project: pipelineProject,
            input: sourceOutput,
        });
        pipeline.addStage({
            stageName: 'SyncPipeline',
            actions: [pipelineBuildAction],
        });

        // Build
        const buildProject = new codebuild.PipelineProject(this, 'BuildProject', {
            buildSpec: codebuild.BuildSpec.fromSourceFilename(props.buildspecLocation),
            environment: {
              buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_5,
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
            resources: [Stack.of(this).formatArn({
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
            actions: ["sts:AssumeRole"],
            resources: [`arn:${Stack.of(this).partition}:iam::${Stack.of(this).account}:role/cdk-*-file-publishing-role-${Stack.of(this).account}-${Stack.of(this).region}`]
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