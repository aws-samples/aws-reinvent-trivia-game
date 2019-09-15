#!/usr/bin/env node
import cdk = require('@aws-cdk/core');
import codebuild = require('@aws-cdk/aws-codebuild');
import actions = require('@aws-cdk/aws-codepipeline-actions');
import iam = require('@aws-cdk/aws-iam');
import { TriviaGameCfnPipeline } from './pipeline';

class TriviaGameChatBotPipelineStack extends cdk.Stack {
    constructor(parent: cdk.App, name: string, props?: cdk.StackProps) {
        super(parent, name, props);

        const pipelineConstruct = new TriviaGameCfnPipeline(this, 'Pipeline', {
            pipelineName: 'chat-bot',
            stackName: 'ChatBot',
            templateName: 'ChatBot',
            directory: 'chat-bot'
        });
        const pipeline = pipelineConstruct.pipeline;

        // Use CodeBuild to run script that deploys the Lex model
        const lexProject = new codebuild.PipelineProject(this, 'LexProject', {
            buildSpec: codebuild.BuildSpec.fromSourceFilename('chat-bot/lex-model/buildspec.yml'),
            environment: {
                buildImage: codebuild.LinuxBuildImage.UBUNTU_14_04_NODEJS_10_1_0
            }
        });

        lexProject.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                'lex:StartImport', 'lex:GetImport',
                'lex:GetIntent', 'lex:PutIntent',
                'lex:GetSlotType', 'lex:PutSlotType',
                'lex:GetBot', 'lex:PutBot', 'lex:PutBotAlias'
            ],
            resources: ["*"]
        }));
        lexProject.addToRolePolicy(new iam.PolicyStatement({
            actions: ['cloudformation:DescribeStackResource'],
            resources: [cdk.Stack.of(this).formatArn({
                service: 'cloudformation',
                resource: 'stack',
                resourceName: 'TriviaGameChatBot*'
            })]
        }));

        const deployBotAction = new actions.CodeBuildAction({
            actionName: 'Deploy',
            project: lexProject,
            input: pipelineConstruct.sourceOutput
        });

        pipeline.addStage({
            stageName: 'DeployLexBot',
            actions: [deployBotAction]
        });
    }
}

const app = new cdk.App();
new TriviaGameChatBotPipelineStack(app, 'TriviaGameChatBotPipeline', {
    env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1' }
});
app.synth();