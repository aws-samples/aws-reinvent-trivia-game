#!/usr/bin/env node
import { App, Duration, Stack, StackProps } from 'aws-cdk-lib';
import {
  aws_certificatemanager as acm,
  aws_cloudwatch as cloudwatch,
  aws_ec2 as ec2,
  aws_ecr as ecr,
  aws_ecs as ecs,
  aws_ecs_patterns as patterns,
  aws_elasticloadbalancingv2 as elb,
  aws_route53 as route53,
  aws_ssm as ssm,
} from 'aws-cdk-lib';

interface TriviaBackendStackProps extends StackProps {
  domainName: string;
  domainZone: string;
}

class TriviaBackendStack extends Stack {
  constructor(parent: App, name: string, props: TriviaBackendStackProps) {
    super(parent, name, props);

    // Network infrastructure
    const vpc = new ec2.Vpc(this, 'VPC', { maxAzs: 2 });
    const cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: props.domainName.replace(/\./g, '-'),
      vpc,
      containerInsights: true
    });

    // Configuration parameters
    const domainZone = route53.HostedZone.fromLookup(this, 'Zone', { domainName: props.domainZone });
    const imageRepo = ecr.Repository.fromRepositoryName(this, 'Repo', 'reinvent-trivia-backend');
    const tag = (process.env.IMAGE_TAG) ? process.env.IMAGE_TAG : 'latest';
    const image = ecs.ContainerImage.fromEcrRepository(imageRepo, tag)

    // Lookup pre-existing TLS certificate
    const certificateArn = ssm.StringParameter.fromStringParameterAttributes(this, 'CertArnParameter', {
      parameterName: 'CertificateArn-' + props.domainName
    }).stringValue;
    const certificate = acm.Certificate.fromCertificateArn(this, 'Cert', certificateArn);

    // Fargate service + load balancer
    const service = new patterns.ApplicationLoadBalancedFargateService(this, 'Service', {
      cluster,
      taskImageOptions: { image },
      desiredCount: 3,
      domainName: props.domainName,
      domainZone,
      certificate,
      propagateTags: ecs.PropagatedTagSource.SERVICE,
    });

    // Enable AZ rebalancing
    const cfnService = service.service.node.defaultChild as ecs.CfnService;
    cfnService.availabilityZoneRebalancing = 'ENABLED';

    // Alarms: monitor 500s and unhealthy hosts on target groups
    new cloudwatch.Alarm(this, 'TargetGroupUnhealthyHosts', {
      alarmName: this.stackName + '-Unhealthy-Hosts',
      metric: service.targetGroup.metricUnhealthyHostCount(),
      threshold: 1,
      evaluationPeriods: 2,
    });

    new cloudwatch.Alarm(this, 'TargetGroup5xx', {
      alarmName: this.stackName + '-Http-500',
      metric: service.targetGroup.metricHttpCodeTarget(
        elb.HttpCodeTarget.TARGET_5XX_COUNT,
        { period: Duration.minutes(1) }
      ),
      threshold: 1,
      evaluationPeriods: 1,
    });
  }
}

const app = new App();
new TriviaBackendStack(app, 'TriviaBackendTest', {
  domainName: 'api-test.reinvent-trivia.com',
  domainZone: 'reinvent-trivia.com',
  env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1' },
  tags: {
      project: "reinvent-trivia"
  }
});
new TriviaBackendStack(app, 'TriviaBackendProd', {
  domainName: 'api.reinvent-trivia.com',
  domainZone: 'reinvent-trivia.com',
  env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1' },
  tags: {
      project: "reinvent-trivia"
  }
});
app.synth();
