#!/usr/bin/env node
import cdk = require('@aws-cdk/cdk');
import { TriviaGameCfnPipeline } from './pipeline';

class TriviaGameInfrastructurePipelineStack extends cdk.Stack {
    constructor(parent: cdk.App, name: string, props?: cdk.StackProps) {
        super(parent, name, props);

        new TriviaGameCfnPipeline(this, 'Pipeline', {
           stackName: 'infrastructure',
           directory: 'infrastructure'
        });
    }
}

const app = new cdk.App();
new TriviaGameInfrastructurePipelineStack(app, 'TriviaGameInfraPipeline');
app.run();