#!/usr/bin/env node
import cdk = require('@aws-cdk/core');
import { TriviaGameCfnPipeline } from './common/cfn-pipeline';

class TriviaGameLifecycleHooksPipelineStack extends cdk.Stack {
    constructor(parent: cdk.App, name: string, props?: cdk.StackProps) {
        super(parent, name, props);

        new TriviaGameCfnPipeline(this, 'Pipeline', {
            pipelineName: 'codedeploy-lifecycle-event-hooks',
            stackName: 'Hooks',
            stackNamePrefix: 'TriviaBackend',
            templateName: 'Hooks',
            directory: 'trivia-backend/infra/codedeploy-lifecycle-event-hooks'
        });
    }
}

const app = new cdk.App();
new TriviaGameLifecycleHooksPipelineStack(app, 'TriviaGameLifecycleHooksPipeline', {
    env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1' },
    tags: {
        project: "reinvent-trivia"
    }
});
app.synth();