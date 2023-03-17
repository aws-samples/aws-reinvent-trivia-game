#!/usr/bin/env node
import { Construct } from 'constructs';
import { Fn, Stack } from 'aws-cdk-lib';
import {
    aws_codebuild as codebuild,
    aws_codepipeline as codepipeline,
    aws_codestarnotifications as notifications,
    aws_codepipeline_actions as actions,
    aws_iam as iam,
} from 'aws-cdk-lib';

export interface TriviaGameCfnPipelineProps {
    stackNamePrefix?: string;
    stackName: string;
    templateName: string;
    pipelineName: string;
    pipelineCdkFileName: string;
    directory: string;
}

/**
 * A common class for a pipeline that deploys a CloudFormation template.
 * [GitHub source] -> [CodeBuild build] -> [Deploy CFN 'test' stack] -> [Deploy CFN 'prod' stack]
 */
export class TriviaGameCfnPipeline extends Construct {
    public readonly pipeline: codepipeline.Pipeline;

    public readonly sourceOutput: codepipeline.Artifact;

    constructor(parent: Construct, name: string, props: TriviaGameCfnPipelineProps) {
        super(parent, name);

        const pipeline = new codepipeline.Pipeline(this, "Pipeline", {
            pipelineName: "reinvent-trivia-game-" + props.pipelineName,
            restartExecutionOnUpdate: true,
        });
        this.pipeline = pipeline;

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
        pipeline.addStage({
            stageName: 'Source',
            actions: [sourceAction],
        });
        this.sourceOutput = sourceOutput;

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
                buildImage: codebuild.LinuxBuildImage.fromCodeBuildImageId('aws/codebuild/amazonlinux2-x86_64-standard:4.0'),
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
            buildSpec: codebuild.BuildSpec.fromSourceFilename(props.directory + '/buildspec.yml'),
            environment: {
              buildImage: codebuild.LinuxBuildImage.fromCodeBuildImageId('aws/codebuild/amazonlinux2-x86_64-standard:4.0'),
              environmentVariables: {
                'ARTIFACTS_BUCKET': {
                    value: pipeline.artifactBucket.bucketName
                }
              },
              privileged: true
            }
        });

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
        const stackPrefix = props.stackNamePrefix ? props.stackNamePrefix : 'TriviaGame';
        const testStackName = stackPrefix + props.stackName + 'Test';
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
                    templateConfiguration: buildArtifact.atPath('StackConfigTest.json'),
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
        const prodStackName = stackPrefix + props.stackName + 'Prod';

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
                    templateConfiguration: buildArtifact.atPath('StackConfigProd.json'),
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