#!/usr/bin/env node
import cdk = require('@aws-cdk/cdk');
import { TriviaGameCfnPipeline } from './pipeline';

class TriviaGameBackendPipelineStack extends cdk.Stack {
    constructor(parent: cdk.App, name: string, props?: cdk.StackProps) {
        super(parent, name, props);

        new TriviaGameCfnPipeline(this, 'Pipeline', {
            pipelineName: 'trivia-backend',
            stackName: 'TriviaBackend',
            templateName: 'TriviaBackend',
            directory: 'trivia-backend/cdk'
        });
    }
}

const app = new cdk.App();
new TriviaGameBackendPipelineStack(app, 'TriviaGameBackendPipeline');
app.run();