#!/usr/bin/env node
import ec2 = require('@aws-cdk/aws-ec2');
import ecs = require('@aws-cdk/aws-ecs');
import cdk = require('@aws-cdk/cdk');

class SharedInfrastructureStack extends cdk.Stack {
    constructor(parent: cdk.App, name: string, props?: cdk.StackProps) {
        super(parent, name, props);

        const vpc = new ec2.VpcNetwork(this, 'TriviaGameVPC', { maxAZs: 2 });

        const cluster = new ecs.FargateCluster(this, 'TriviaGameCluster', { vpc });
        cluster.export();
    }
}

const app = new cdk.App();
new SharedInfrastructureStack(app, 'TriviaGameSharedInfraTest');
new SharedInfrastructureStack(app, 'TriviaGameSharedInfraProd');
app.run();