#!/usr/bin/env node
import { App,  CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { aws_codestarconnections as connections } from 'aws-cdk-lib';

class TriviaGamePipelinesBootstrap extends Stack {
    constructor(parent: App, name: string, props?: StackProps) {
        super(parent, name, props);

        // Create resources used by all the trivia game pipelines
        const codeStarConnection = new connections.CfnConnection(this, 'GitHubConnection', {
            connectionName: 'reinvent-trivia-repo',
            providerType: 'GitHub',
        });

        new CfnOutput(this, 'CodeStarConnection', {
            value: codeStarConnection.attrConnectionArn,
            exportName: 'TriviaGamePipelinesCodeStarConnection'
        });
    }
}

const app = new App();
new TriviaGamePipelinesBootstrap(app, 'TriviaGamePipelines', {
    env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1' },
    tags: {
        project: 'reinvent-trivia'
    }
});
app.synth();