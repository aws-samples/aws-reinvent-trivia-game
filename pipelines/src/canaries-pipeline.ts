#!/usr/bin/env node
import cdk = require('@aws-cdk/core');
import { TriviaGameCfnPipeline } from './common/cfn-pipeline';

class TriviaGameCanariesPipelineStack extends cdk.Stack {
    constructor(parent: cdk.App, name: string, props?: cdk.StackProps) {
        super(parent, name, props);

        new TriviaGameCfnPipeline(this, 'Pipeline', {
            pipelineName: 'canaries',
            stackName: 'Canaries',
            templateName: 'Canaries',
            directory: 'canaries'
        });
    }
}

const app = new cdk.App();
new TriviaGameCanariesPipelineStack(app, 'TriviaGameCanariesPipeline', {
    env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1' },
    tags: {
        project: "reinvent-trivia"
    }
});
app.synth();