#!/usr/bin/env node
import { Port, SecurityGroup, Vpc } from '@aws-cdk/aws-ec2';
import { Repository } from '@aws-cdk/aws-ecr';
import * as ecs from '@aws-cdk/aws-ecs';
import { ApplicationLoadBalancer, ApplicationProtocol, ApplicationTargetGroup, IApplicationLoadBalancerTarget, LoadBalancerTargetProps, TargetType, Protocol } from '@aws-cdk/aws-elasticloadbalancingv2';
import cdk = require('@aws-cdk/core');

class TriviaBackendStack extends cdk.Stack {
  constructor(parent: cdk.App, name: string, props: cdk.StackProps) {
    super(parent, name, props);

    // Configuration parameters
    const imageRepo = Repository.fromRepositoryName(this, 'Repo', 'reinvent-trivia-backend');
    const tag = (process.env.IMAGE_TAG) ? process.env.IMAGE_TAG : 'latest';
    const image = ecs.ContainerImage.fromEcrRepository(imageRepo, tag)

    // Look up existing network infrastructure (default VPC)
    const vpc = Vpc.fromLookup(this, 'Vpc', {
      isDefault: true,
    });
    const subnets = vpc.publicSubnets;
    const cluster = ecs.Cluster.fromClusterAttributes(this, 'Cluster', {
      clusterName: 'default',
      vpc,
      securityGroups: [],
    });

    // Create load balancer and security group resources
    const serviceSG = new SecurityGroup(this, 'ServiceSecurityGroup', { vpc });

    const loadBalancer = new ApplicationLoadBalancer(this, 'LB', {
      vpc,
      internetFacing: true,
    });
    serviceSG.connections.allowFrom(loadBalancer, Port.tcp(80));
    new cdk.CfnOutput(this, 'ServiceURL', { value: 'http://' + loadBalancer.loadBalancerDnsName });

    const listener = loadBalancer.addListener('PublicListener', {
      protocol: ApplicationProtocol.HTTP,
      port: 80,
      open: true,
    });
    const targetGroup = listener.addTargets('ECS', {
      protocol: ApplicationProtocol.HTTP,
      deregistrationDelay: cdk.Duration.seconds(5),
      healthCheck: {
        interval: cdk.Duration.seconds(5),
        path: '/',
        protocol: Protocol.HTTP,
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        timeout: cdk.Duration.seconds(4)
      },
      targets: [ // empty to begin with, set the target type to be 'IP'
        new (class EmptyIpTarget implements IApplicationLoadBalancerTarget {
          attachToApplicationTargetGroup(_: ApplicationTargetGroup): LoadBalancerTargetProps {
            return { targetType: TargetType.IP };
          }
        })()
      ],
    });

    // Create Fargate resources: task definition, service, task set, etc
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {});
    const container = taskDefinition.addContainer('web', {
      image,
      logging: new ecs.AwsLogDriver({ streamPrefix: 'Service' }),
    });
    container.addPortMappings({ containerPort: 80 });

    const service = new ecs.CfnService(this, 'Service', {
      cluster: cluster.clusterName,
      desiredCount: 2,
      deploymentController: { type: ecs.DeploymentControllerType.EXTERNAL },
    });
    service.node.addDependency(targetGroup);
    service.node.addDependency(listener);

    const taskSet = new ecs.CfnTaskSet(this, 'TaskSet', {
      cluster: cluster.clusterName,
      service: service.attrName,
      scale: { unit: 'PERCENT', value: 100 },
      taskDefinition: taskDefinition.taskDefinitionArn,
      launchType: ecs.LaunchType.FARGATE.toString(),
      loadBalancers: [
        {
          containerName: 'web',
          containerPort: 80,
          targetGroupArn: targetGroup.targetGroupArn,
        }
      ],
      networkConfiguration: {
        awsVpcConfiguration: {
          assignPublicIp: 'ENABLED',
          securityGroups: [ serviceSG.securityGroupId ],
          subnets: subnets.map(subnet => subnet.subnetId),
        }
      },
    });

    new ecs.CfnPrimaryTaskSet(this, 'PrimaryTaskSet', {
      cluster: cluster.clusterName,
      service: service.attrName,
      taskSetId: taskSet.attrId,
    });

  }
}

const app = new cdk.App();
new TriviaBackendStack(app, 'TriviaBackendTaskSets', {
  env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1' }
});
app.synth();
