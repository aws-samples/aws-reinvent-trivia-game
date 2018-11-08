#!/usr/bin/env node
import ec2 = require('@aws-cdk/aws-ec2');
import ecs = require('@aws-cdk/aws-ecs');
import cdk = require('@aws-cdk/cdk');

class CdkStack extends cdk.Stack {
  constructor(parent: cdk.App, name: string, props?: cdk.StackProps) {
    super(parent, name, props);

    // TODO VPC and cluster should be imported from common infra pipe
    const vpc = new ec2.VpcNetwork(this, 'TriviaGameVPC', { maxAZs: 2 });
    const cluster = new ecs.Cluster(this, 'TriviaGameCluster', { vpc });

    new ecs.LoadBalancedFargateService(this, 'Service', {
      cluster: cluster,
      image: ecs.ContainerImage.fromAsset(this, 'Image', { directory: '../' })
    });
  }
}

const app = new cdk.App();

new CdkStack(app, 'CdkStack');

app.run();
