#!/usr/bin/env node
import cdk = require('@aws-cdk/cdk');
import { TriviaGameCfnPipeline } from './pipeline';

class TriviaGameChatBotPipelineStack extends cdk.Stack {
    constructor(parent: cdk.App, name: string, props?: cdk.StackProps) {
        super(parent, name, props);

        new TriviaGameCfnPipeline(this, 'Pipeline', {
           stackName: 'chat-bot',
           templateName: 'ChatBot',
           directory: 'chat-bot'
        });
    }
}

const app = new cdk.App();
new TriviaGameChatBotPipelineStack(app, 'TriviaGameChatBotPipeline');
app.run();