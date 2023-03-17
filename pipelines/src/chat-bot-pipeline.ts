#!/usr/bin/env node
import { App,  Stack, StackProps } from 'aws-cdk-lib';
import {
    aws_codebuild as codebuild,
    aws_codepipeline_actions as actions,
    aws_iam as iam,
} from 'aws-cdk-lib';

import { TriviaGameCfnPipeline } from './common/cfn-pipeline';

class TriviaGameChatBotPipelineStack extends Stack {
    constructor(parent: App, name: string, props?: StackProps) {
        super(parent, name, props);

        const pipelineConstruct = new TriviaGameCfnPipeline(this, 'Pipeline', {
            pipelineName: 'chat-bot',
            stackName: 'ChatBot',
            templateName: 'ChatBot',
            directory: 'chat-bot',
            pipelineCdkFileName: 'chat-bot-pipeline',
        });
        const pipeline = pipelineConstruct.pipeline;

        // Use CodeBuild to run script that deploys the Lex model
        const lexProject = new codebuild.PipelineProject(this, 'LexProject', {
            buildSpec: codebuild.BuildSpec.fromSourceFilename('chat-bot/lex-model/buildspec.yml'),
            environment: {
                buildImage: codebuild.LinuxBuildImage.fromCodeBuildImageId('aws/codebuild/amazonlinux2-x86_64-standard:4.0')
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
            resources: [Stack.of(this).formatArn({
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

const app = new App();
new TriviaGameChatBotPipelineStack(app, 'TriviaGameChatBotPipeline', {
    env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1' },
    tags: {
        project: "reinvent-trivia"
    }
});
app.synth();