#!/usr/bin/env node
import ec2 = require('@aws-cdk/aws-ec2');
import ecs = require('@aws-cdk/aws-ecs');
import cdk = require('@aws-cdk/cdk');
import { StaticSite } from './static-site';

class SharedInfrastructureStack extends cdk.Stack {
    constructor(parent: cdk.App, name: string, domainName: string, siteSubDomain: string, props?: cdk.StackProps) {
        super(parent, name, props);

        const vpc = new ec2.VpcNetwork(this, 'TriviaGameVPC', { maxAZs: 2 });

        const cluster = new ecs.FargateCluster(this, 'TriviaGameCluster', { vpc });
        cluster.export();

        new StaticSite(this, 'StaticSite', {
            domainName,
            siteSubDomain
        });
   }
}

const app = new cdk.App();
new SharedInfrastructureStack(app, 'TriviaGameSharedInfraTest', 'reinvent-trivia.com', 'test');
new SharedInfrastructureStack(app, 'TriviaGameSharedInfraProd', 'reinvent-trivia.com', 'www');
app.run();