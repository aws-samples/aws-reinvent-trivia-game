#!/usr/bin/env node
import { App, CfnOutput, Duration, Stack, StackProps } from 'aws-cdk-lib';
import {
  aws_ec2 as ec2,
  aws_ecr as ecr,
  aws_ecs as ecs,
  aws_elasticloadbalancingv2 as elb,
} from 'aws-cdk-lib';


class TriviaBackendStack extends Stack {
  constructor(parent: App, name: string, props: StackProps) {
    super(parent, name, props);

    // Configuration parameters
    const imageRepo = ecr.Repository.fromRepositoryName(this, 'Repo', 'reinvent-trivia-backend');
    const tag = (process.env.IMAGE_TAG) ? process.env.IMAGE_TAG : 'latest';
    const image = ecs.ContainerImage.fromEcrRepository(imageRepo, tag)

    // Look up existing network infrastructure (default VPC)
    const vpc = ec2.Vpc.fromLookup(this, 'Vpc', {
      isDefault: true,
    });
    const subnets = vpc.publicSubnets;
    const cluster = ecs.Cluster.fromClusterAttributes(this, 'Cluster', {
      clusterName: 'default',
      vpc,
      securityGroups: [],
    });

    // Create load balancer and security group resources
    const serviceSG = new ec2.SecurityGroup(this, 'ServiceSecurityGroup', { vpc });

    const loadBalancer = new elb.ApplicationLoadBalancer(this, 'LB', {
      vpc,
      internetFacing: true,
    });
    serviceSG.connections.allowFrom(loadBalancer, ec2.Port.tcp(80));
    new CfnOutput(this, 'ServiceURL', { value: 'http://' + loadBalancer.loadBalancerDnsName });

    const listener = loadBalancer.addListener('PublicListener', {
      protocol: elb.ApplicationProtocol.HTTP,
      port: 80,
      open: true,
    });
    const targetGroup = listener.addTargets('ECS', {
      protocol: elb.ApplicationProtocol.HTTP,
      deregistrationDelay: Duration.seconds(5),
      healthCheck: {
        interval: Duration.seconds(5),
        path: '/',
        protocol: elb.Protocol.HTTP,
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        timeout: Duration.seconds(4)
      },
      targets: [ // empty to begin with, set the target type to be 'IP'
        new (class EmptyIpTarget implements elb.IApplicationLoadBalancerTarget {
          attachToApplicationTargetGroup(_: elb.ApplicationTargetGroup): elb.LoadBalancerTargetProps {
            return { targetType: elb.TargetType.IP };
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
      availabilityZoneRebalancing: 'ENABLED',
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

const app = new App();
new TriviaBackendStack(app, 'TriviaBackendTaskSets', {
  env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1' }
});
app.synth();
