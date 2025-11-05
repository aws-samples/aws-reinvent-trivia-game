#!/usr/bin/env node
import { App, Stack, StackProps } from 'aws-cdk-lib';

import { TriviaGameCfnPipeline } from './common/cfn-pipeline';

class TriviaGameChatBotPipelineStack extends Stack {
    constructor(parent: App, name: string, props?: StackProps) {
        super(parent, name, props);

        new TriviaGameCfnPipeline(this, 'Pipeline', {
            pipelineName: 'chat-bot',
            stackName: 'ChatBot',
            templateName: 'ChatBot',
            directory: 'chat-bot',
            pipelineCdkFileName: 'chat-bot-pipeline',
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