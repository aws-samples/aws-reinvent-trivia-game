#!/usr/bin/env node
import { App, Stack, StackProps } from 'aws-cdk-lib';
import { TriviaGameContainersCfnPipeline } from './common/cfn-containers-pipeline';

/**
 * Pipeline that builds a container image and deploys it to ECS using CloudFormation and ECS rolling update deployments.
 * [Sources: GitHub source, ECR base image] -> [CodeBuild build] -> [CloudFormation Deploy Actions to 'test' stack] -> [CloudFormation Deploy Actions to 'prod' stack]
 */
class TriviaGameBackendPipelineStack extends Stack {
    constructor(parent: App, name: string, props?: StackProps) {
        super(parent, name, props);

        new TriviaGameContainersCfnPipeline(this, 'Pipeline', {
            pipelineNameSuffix: 'trivia-backend-cfn-deploy',
            stackNamePrefix: 'TriviaBackend',
            templateNamePrefix: 'TriviaBackend',
            buildspecLocation: 'trivia-backend/cdk/buildspec.yml',
            pipelineCdkFileName: 'api-service-pipeline',
        });
    }
}

const app = new App();
new TriviaGameBackendPipelineStack(app, 'TriviaGameBackendPipeline', {
    env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1' },
    tags: {
        project: 'reinvent-trivia'
    }
});
app.synth();
