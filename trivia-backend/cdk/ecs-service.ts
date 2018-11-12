#!/usr/bin/env node
import { CertificateRef } from '@aws-cdk/aws-certificatemanager';
import { VpcNetwork } from '@aws-cdk/aws-ec2';
import { RepositoryRef } from '@aws-cdk/aws-ecr';
import { Cluster, ContainerImage, LoadBalancedFargateService} from '@aws-cdk/aws-ecs';
import { ApplicationProtocol, ApplicationTargetGroup, IApplicationLoadBalancerTarget, LoadBalancerTargetProps, TargetType } from '@aws-cdk/aws-elasticloadbalancingv2';
import { HostedZoneProvider } from '@aws-cdk/aws-route53';
import { Alarm, Metric } from '@aws-cdk/aws-cloudwatch';
import cdk = require('@aws-cdk/cdk');

interface TriviaBackendStackProps extends cdk.StackProps {
  domainName: string;
  domainZone: string;
}

class TriviaBackendStack extends cdk.Stack {
  constructor(parent: cdk.App, name: string, props: TriviaBackendStackProps) {
    super(parent, name, props);

    // Network infrastructure
    const vpc = new VpcNetwork(this, 'VPC', { maxAZs: 2 });
    const cluster = new Cluster(this, 'Cluster', { vpc });

    // Configuration parameters
    const domainZone = new HostedZoneProvider(this, { domainName: props.domainZone }).findAndImport(this, 'Zone');
    const certParam = new cdk.SSMParameterProvider(this, { parameterName: 'CertificateArn-' + props.domainName });
    const certificate = CertificateRef.import(this, 'Cert', { certificateArn: certParam.parameterValue() });
    const imageRepo = RepositoryRef.import(this, 'Repo', {
      repositoryArn: cdk.ArnUtils.fromComponents({
        service: 'ecr',
        resource: 'repository',
        resourceName: 'reinvent-trivia-backend'
      })
    });
    const tag = (process.env.IMAGE_TAG) ? process.env.IMAGE_TAG : 'latest';
    const image = ContainerImage.fromEcrRepository(imageRepo, tag)

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
    let testListener = service.loadBalancer.addListener('TestListener', {
      port: 9002, // port for testing
      protocol: ApplicationProtocol.Https,
      open: true,
      certificateArns: [certificate.certificateArn]
    });
    const tg2 = testListener.addTargets('ECS2', {
      port: 80,
      targets: [ // empty to begin with
        new (class EmptyIpTarget implements IApplicationLoadBalancerTarget {
          attachToApplicationTargetGroup(_: ApplicationTargetGroup): LoadBalancerTargetProps {
            return { targetType: TargetType.Ip };
          }
        })()
      ]
    });

    // Alarms: monitor 500s and unhealthy hosts
    // TODO use an L2 method on the load balancer and on the service
    new Alarm(this, 'AlarmUnhealthyHostsOne', {
      metric: new Metric({
        namespace: "AWS/ApplicationELB",
        metricName: "UnHealthyHostCount",
        dimensions: {
          TargetGroup: service.targetGroup.targetGroupFullName,
          LoadBalancer: service.loadBalancer.fullName
        },
        periodSec: 60,
        statistic: "Sum"
      }),
      threshold: 2,
      evaluationPeriods: 2,
    });

    new Alarm(this, 'AlarmUnhealthyHostsTwo', {
      metric: new Metric({
        namespace: "AWS/ApplicationELB",
        metricName: "UnHealthyHostCount",
        dimensions: {
          TargetGroup: tg2.targetGroupFullName,
          LoadBalancer: service.loadBalancer.fullName
        },
        periodSec: 60,
        statistic: "Sum"
      }),
      threshold: 2,
      evaluationPeriods: 2,
    });

    new Alarm(this, 'Alarm5xxOne', {
      metric: new Metric({
        namespace: "AWS/ApplicationELB",
        metricName: "HTTPCode_Target_5XX_Count",
        dimensions: {
          TargetGroup: service.targetGroup.targetGroupFullName,
          LoadBalancer: service.loadBalancer.fullName
        },
        periodSec: 60,
        statistic: "Sum"
      }),
      threshold: 1,
      evaluationPeriods: 2,
    });

    new Alarm(this, 'Alarm5xxTwo', {
      metric: new Metric({
        namespace: "AWS/ApplicationELB",
        metricName: "HTTPCode_Target_5XX_Count",
        dimensions: {
          TargetGroup: tg2.targetGroupFullName,
          LoadBalancer: service.loadBalancer.fullName
        },
        periodSec: 60,
        statistic: "Sum"
      }),
      threshold: 1,
      evaluationPeriods: 2,
    });

    // TODO add logging, tracing, autoscaling
  }
}

const app = new cdk.App();
new TriviaBackendStack(app, 'TriviaBackendTest', {
    domainName: 'api-test.reinvent-trivia.com',
    domainZone: 'reinvent-trivia.com'
});
new TriviaBackendStack(app, 'TriviaBackendProd', {
  domainName: 'api.reinvent-trivia.com',
  domainZone: 'reinvent-trivia.com'
});
app.run();