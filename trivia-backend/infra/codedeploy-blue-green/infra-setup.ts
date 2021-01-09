#!/usr/bin/env node
import { Alarm, AlarmRule, AlarmState, CompositeAlarm } from '@aws-cdk/aws-cloudwatch';
import { Port, SecurityGroup, Vpc } from '@aws-cdk/aws-ec2';
import { ApplicationLoadBalancer, ApplicationProtocol, ApplicationTargetGroup, HttpCodeTarget, IApplicationLoadBalancerTarget, LoadBalancerTargetProps, TargetType } from '@aws-cdk/aws-elasticloadbalancingv2';
import { RecordTarget, ARecord, HostedZone } from '@aws-cdk/aws-route53';
import { LoadBalancerTarget } from '@aws-cdk/aws-route53-targets';
import { StringParameter } from '@aws-cdk/aws-ssm';
import { ManagedPolicy, Role, ServicePrincipal } from '@aws-cdk/aws-iam';
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
    const serviceSG = new SecurityGroup(this, 'ServiceSecurityGroup', { vpc });

    // Lookup pre-existing TLS certificate
    const certificateArn = StringParameter.fromStringParameterAttributes(this, 'CertArnParameter', {
      parameterName: 'CertificateArn-' + props.domainName
    }).stringValue;

    // Load balancer
    const loadBalancer = new ApplicationLoadBalancer(this, 'ServiceLB', {
      vpc,
      internetFacing: true
    });
    serviceSG.connections.allowFrom(loadBalancer, Port.tcp(80));

    const domainZone = HostedZone.fromLookup(this, 'Zone', { domainName: props.domainZone });
    new ARecord(this, "DNS", {
      zone: domainZone,
      recordName: props.domainName,
      target: RecordTarget.fromAlias(new LoadBalancerTarget(loadBalancer)),
    });

    // Primary traffic listener
    const listener = loadBalancer.addListener('PublicListener', {
      port: 443,
      open: true,
      certificateArns: [certificateArn]
    });

    // Second listener for test traffic
    let testListener = loadBalancer.addListener('TestListener', {
      port: 9002, // port for testing
      protocol: ApplicationProtocol.HTTPS,
      open: true,
      certificateArns: [certificateArn]
    });

    // First target group for blue fleet
    const tg1 = listener.addTargets('ECS', {
      port: 80,
      targets: [ // empty to begin with
        new (class EmptyIpTarget implements IApplicationLoadBalancerTarget {
          attachToApplicationTargetGroup(_: ApplicationTargetGroup): LoadBalancerTargetProps {
            return { targetType: TargetType.IP };
          }
        })()
      ],
      deregistrationDelay: cdk.Duration.seconds(30),
      healthCheck: {
        interval: cdk.Duration.seconds(5),
        healthyHttpCodes: '200',
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        timeout: cdk.Duration.seconds(4)
      }
    });

    // Second target group for green fleet
    const tg2 = testListener.addTargets('ECS2', {
      port: 80,
      targets: [ // empty to begin with
        new (class EmptyIpTarget implements IApplicationLoadBalancerTarget {
          attachToApplicationTargetGroup(_: ApplicationTargetGroup): LoadBalancerTargetProps {
            return { targetType: TargetType.IP };
          }
        })()
      ],
      deregistrationDelay: cdk.Duration.seconds(30),
      healthCheck: {
        interval: cdk.Duration.seconds(5),
        healthyHttpCodes: '200',
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        timeout: cdk.Duration.seconds(4)
      }
    });

    // Alarms: monitor 500s and unhealthy hosts on target groups
    const tg1UnhealthyHosts = new Alarm(this, 'TargetGroupUnhealthyHosts', {
      alarmName: this.stackName + '-Unhealthy-Hosts-Blue',
      metric: tg1.metricUnhealthyHostCount(),
      threshold: 1,
      evaluationPeriods: 2,
    });

    const tg1ApiFailure = new Alarm(this, 'TargetGroup5xx', {
      alarmName: this.stackName + '-Http-500-Blue',
      metric: tg1.metricHttpCodeTarget(HttpCodeTarget.TARGET_5XX_COUNT),
      threshold: 1,
      evaluationPeriods: 1,
      period: cdk.Duration.minutes(1)
    });

    const tg2UnhealthyHosts = new Alarm(this, 'TargetGroup2UnhealthyHosts', {
      alarmName: this.stackName + '-Unhealthy-Hosts-Green',
      metric: tg2.metricUnhealthyHostCount(),
      threshold: 1,
      evaluationPeriods: 2,
    });

    const tg2ApiFailure = new Alarm(this, 'TargetGroup25xx', {
      alarmName: this.stackName + '-Http-500-Green',
      metric: tg2.metricHttpCodeTarget(HttpCodeTarget.TARGET_5XX_COUNT),
      threshold: 1,
      evaluationPeriods: 1,
      period: cdk.Duration.minutes(1)
    });

    new CompositeAlarm(this, 'CompositeUnhealthyHosts', {
      compositeAlarmName: this.stackName + '-Unhealthy-Hosts',
      alarmRule: AlarmRule.anyOf(
        AlarmRule.fromAlarm(tg1UnhealthyHosts, AlarmState.ALARM),
        AlarmRule.fromAlarm(tg2UnhealthyHosts, AlarmState.ALARM))
    });

    new CompositeAlarm(this, 'Composite5xx', {
      compositeAlarmName: this.stackName + '-Http-500',
      alarmRule: AlarmRule.anyOf(
        AlarmRule.fromAlarm(tg1ApiFailure, AlarmState.ALARM),
        AlarmRule.fromAlarm(tg2ApiFailure, AlarmState.ALARM))
    });

    // Roles
    new Role(this, 'ServiceTaskDefExecutionRole', {
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [ ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy') ]
    });

    new Role(this, 'ServiceTaskDefTaskRole', {
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    new Role(this, 'CodeDeployRole', {
      assumedBy: new ServicePrincipal('codedeploy.amazonaws.com'),
      managedPolicies: [ ManagedPolicy.fromAwsManagedPolicyName('AWSCodeDeployRoleForECS') ]
    });
  }
}

const app = new cdk.App();
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
