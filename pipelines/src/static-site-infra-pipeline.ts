#!/usr/bin/env node
import cdk = require('@aws-cdk/cdk');
import { TriviaGameCfnPipeline } from './pipeline';

class TriviaGameStaticSiteInfraPipelineStack extends cdk.Stack {
    constructor(parent: cdk.App, name: string, props?: cdk.StackProps) {
        super(parent, name, props);

        new TriviaGameCfnPipeline(this, 'Pipeline', {
           stackName: 'static-site-infra',
           templateName: 'StaticSiteInfra',
           directory: 'static-site/cdk'
        });
    }
}

const app = new cdk.App();
new TriviaGameStaticSiteInfraPipelineStack(app, 'TriviaGameStaticSiteInfraPipeline');
app.run();