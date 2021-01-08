#!/usr/bin/env node
import cdk = require('@aws-cdk/core');
import { TriviaGameContainersCfnPipeline } from './common/cfn-containers-pipeline';

/**
 * Pipeline that builds a container image and deploys it to ECS using CloudFormation and ECS rolling update deployments.
 * [Sources: GitHub source, ECR base image] -> [CodeBuild build] -> [CloudFormation Deploy Actions to 'test' stack] -> [CloudFormation Deploy Actions to 'prod' stack]
 */
class TriviaGameBackendPipelineStack extends cdk.Stack {
    constructor(parent: cdk.App, name: string, props?: cdk.StackProps) {
        super(parent, name, props);

        new TriviaGameContainersCfnPipeline(this, 'Pipeline', {
            pipelineNameSuffix: 'trivia-backend-cfn-deploy',
            stackNamePrefix: 'TriviaBackend',
            templateNamePrefix: 'TriviaBackend',
            buildspecLocation: 'trivia-backend/infra/cdk/buildspec.yml'
        });
    }
}

const app = new cdk.App();
new TriviaGameBackendPipelineStack(app, 'TriviaGameBackendPipeline', {
    env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1' },
    tags: {
        project: 'reinvent-trivia'
    }
});
app.synth();