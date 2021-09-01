#!/usr/bin/env node
import connections = require('@aws-cdk/aws-codestarconnections');
import cdk = require('@aws-cdk/core');

class TriviaGamePipelinesBootstrap extends cdk.Stack {
    constructor(parent: cdk.App, name: string, props?: cdk.StackProps) {
        super(parent, name, props);

        // Create resources used by all the trivia game pipelines
        const codeStarConnection = new connections.CfnConnection(this, 'GitHubConnection', {
            connectionName: 'reinvent-trivia-repo',
            providerType: 'GitHub',
        });

        new cdk.CfnOutput(this, 'CodeStarConnection', {
            value: codeStarConnection.attrConnectionArn,
            exportName: 'TriviaGamePipelinesCodeStarConnection'
        });
    }
}

const app = new cdk.App();
new TriviaGamePipelinesBootstrap(app, 'TriviaGamePipelines', {
    env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1' },
    tags: {
        project: 'reinvent-trivia'
    }
});
app.synth();