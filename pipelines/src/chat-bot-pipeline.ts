#!/usr/bin/env node
import cdk = require('@aws-cdk/cdk');
import codebuild = require('@aws-cdk/aws-codebuild');
import iam = require('@aws-cdk/aws-iam');
import { TriviaGameCfnPipeline } from './pipeline';

class TriviaGameChatBotPipelineStack extends cdk.Stack {
    constructor(parent: cdk.App, name: string, props?: cdk.StackProps) {
        super(parent, name, props);

        const pipelineConstruct = new TriviaGameCfnPipeline(this, 'Pipeline', {
           stackName: 'chat-bot',
           templateName: 'ChatBot',
           directory: 'chat-bot'
        });
        const pipeline = pipelineConstruct.pipeline;

        // Use CodeBuild to run script that deploys the Lex model
        const lexProject = new codebuild.Project(this, 'LexProject', {
            source: new codebuild.CodePipelineSource(),
            buildSpec: 'chat-bot/lex-model/buildspec.yml',
            environment: {
              buildImage: codebuild.LinuxBuildImage.UBUNTU_14_04_NODEJS_10_1_0
            },
            artifacts: new codebuild.CodePipelineBuildArtifacts()
        });

        lexProject.addToRolePolicy(new iam.PolicyStatement()
            .addActions('lex:GetIntent', 'lex:PutIntent')
            .addActions('lex:GetSlotType', 'lex:PutSlotType')
            .addActions('lex:GetBot', 'lex:PutBot')
            .addAllResources());
        lexProject.addToRolePolicy(new iam.PolicyStatement()
            .addAction('cloudformation:DescribeStackResource')
            .addResource(cdk.ArnUtils.fromComponents({
                service: 'cloudformation',
                resource: 'stack',
                resourceName: 'reinvent-trivia-chat-bot-*'
            })));

        const deployLexStage = pipeline.addStage('DeployLexBot');
        lexProject.addBuildToPipeline(deployLexStage, 'Deploy',
            { inputArtifact: pipelineConstruct.sourceAction.outputArtifact });
    }
}

const app = new cdk.App();
new TriviaGameChatBotPipelineStack(app, 'TriviaGameChatBotPipeline');
app.run();