#!/usr/bin/env node
import { Certificate } from '@aws-cdk/aws-certificatemanager';
import { Vpc } from '@aws-cdk/aws-ec2';
import { Repository } from '@aws-cdk/aws-ecr';
import { Cluster, ContainerImage } from '@aws-cdk/aws-ecs';
import { LoadBalancedFargateService } from '@aws-cdk/aws-ecs-patterns';
import {
  ApplicationProtocol,
  ApplicationTargetGroup,
  HttpCodeTarget,
  IApplicationLoadBalancerTarget,
  LoadBalancerTargetProps,
  TargetType,
  ApplicationLoadBalancer
} from '@aws-cdk/aws-elasticloadbalancingv2';
import { HostedZone } from '@aws-cdk/aws-route53';
import { Alarm } from '@aws-cdk/aws-cloudwatch';
import { StringParameter } from '@aws-cdk/aws-ssm';
import cdk = require('@aws-cdk/core');

interface TriviaBackendStackProps extends cdk.StackProps {
  domainName: string;
  domainZone: string;
}

class TriviaBackendStack extends cdk.Stack {
  constructor(parent: cdk.App, name: string, props: TriviaBackendStackProps) {
    super(parent, name, props);

    // Network infrastructure
    const vpc = new Vpc(this, 'VPC', { maxAzs: 2 });
    const cluster = new Cluster(this, 'Cluster', {
      clusterName: props.domainName.replace(/\./g, '-'),
      vpc
    });

    // Configuration parameters
    const domainZone = HostedZone.fromLookup(this, 'Zone', { domainName: props.domainZone });
    const imageRepo = Repository.fromRepositoryName(this, 'Repo', 'reinvent-trivia-backend');
    const tag = (process.env.IMAGE_TAG) ? process.env.IMAGE_TAG : 'latest';
    const image = ContainerImage.fromEcrRepository(imageRepo, tag)

    // Lookup pre-existing TLS certificate
    const certificateArn = StringParameter.fromStringParameterAttributes(this, 'CertArnParameter', {
      parameterName: 'CertificateArn-' + props.domainName
    }).stringValue;
    const certificate = Certificate.fromCertificateArn(this, 'Cert', certificateArn);

    // Fargate service + load balancer
    const service = new LoadBalancedFargateService(this, 'Service', {
      cluster,
      image,
      desiredCount: 3,
      domainName: props.domainName,
      domainZone,
      certificate
    });

    // Second listener for testing
    let serviceLB = service.loadBalancer as ApplicationLoadBalancer;
    let testListener = serviceLB.addListener('TestListener', {
      port: 9002, // port for testing
      protocol: ApplicationProtocol.HTTPS,
      open: true,
      certificateArns: [certificateArn]
    });
    const tg2 = testListener.addTargets('ECS2', {
      port: 80,
      targets: [ // empty to begin with
        new (class EmptyIpTarget implements IApplicationLoadBalancerTarget {
          attachToApplicationTargetGroup(_: ApplicationTargetGroup): LoadBalancerTargetProps {
            return { targetType: TargetType.IP };
          }
        })()
      ]
    });

    // Alarms: monitor 500s and unhealthy hosts on target groups
    let tg = service.targetGroup as ApplicationTargetGroup;
    new Alarm(this, 'TargetGroupUnhealthyHosts', {
      metric: tg.metricUnhealthyHostCount(),
      threshold: 1,
      evaluationPeriods: 2,
    });

    new Alarm(this, 'TargetGroup5xx', {
      metric: tg.metricHttpCodeTarget(HttpCodeTarget.TARGET_5XX_COUNT),
      threshold: 1,
      evaluationPeriods: 2,
    });

    new Alarm(this, 'TargetGroup2UnhealthyHosts', {
      metric: tg2.metricUnhealthyHostCount(),
      threshold: 1,
      evaluationPeriods: 2,
    });

    new Alarm(this, 'TargetGroup25xx', {
      metric: tg2.metricHttpCodeTarget(HttpCodeTarget.TARGET_5XX_COUNT),
      threshold: 1,
      evaluationPeriods: 2,
    });

    // TODO add logging, tracing, autoscaling
  }
}

const app = new cdk.App();
new TriviaBackendStack(app, 'TriviaBackendTest', {
  domainName: 'api-test.reinvent-trivia.com',
  domainZone: 'reinvent-trivia.com',
  env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1' }
});
new TriviaBackendStack(app, 'TriviaBackendProd', {
  domainName: 'api.reinvent-trivia.com',
  domainZone: 'reinvent-trivia.com',
  env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1' }
});
app.synth();
