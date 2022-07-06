import { App, Duration, Stack, StackProps } from 'aws-cdk-lib';
import {
  aws_certificatemanager as acm,
  aws_cloudwatch as cloudwatch,
  aws_ec2 as ec2,
  aws_iam as iam,
  aws_elasticloadbalancingv2 as elb,
  aws_route53 as route53,
  aws_route53_targets as targets,
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
    const serviceSG = new ec2.SecurityGroup(this, 'ServiceSecurityGroup', { vpc });

    // Lookup pre-existing TLS certificate
    const certificateArn = ssm.StringParameter.fromStringParameterAttributes(this, 'CertArnParameter', {
      parameterName: 'CertificateArn-' + props.domainName
    }).stringValue;
    const certificate = acm.Certificate.fromCertificateArn(this, 'Certificate', certificateArn);

    // Load balancer
    const loadBalancer = new elb.ApplicationLoadBalancer(this, 'ServiceLB', {
      vpc,
      internetFacing: true
    });
    serviceSG.connections.allowFrom(loadBalancer, ec2.Port.tcp(80));

    const domainZone = route53.HostedZone.fromLookup(this, 'Zone', { domainName: props.domainZone });
    new route53.ARecord(this, "DNS", {
      zone: domainZone,
      recordName: props.domainName,
      target: route53.RecordTarget.fromAlias(new targets.LoadBalancerTarget(loadBalancer)),
    });

    // Primary traffic listener
    const listener = loadBalancer.addListener('PublicListener', {
      port: 443,
      open: true,
      certificates: [certificate]
    });

    // Second listener for test traffic
    let testListener = loadBalancer.addListener('TestListener', {
      port: 9002, // port for testing
      protocol: elb.ApplicationProtocol.HTTPS,
      open: true,
      certificates: [certificate]
    });

    // First target group for blue fleet
    const tg1 = listener.addTargets('ECS', {
      port: 80,
      targets: [ // empty to begin with
        new (class EmptyIpTarget implements elb.IApplicationLoadBalancerTarget {
          attachToApplicationTargetGroup(_: elb.ApplicationTargetGroup): elb.LoadBalancerTargetProps {
            return { targetType: elb.TargetType.IP };
          }
        })()
      ],
      deregistrationDelay: Duration.seconds(30),
      healthCheck: {
        interval: Duration.seconds(5),
        healthyHttpCodes: '200',
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        timeout: Duration.seconds(4)
      }
    });

    // Second target group for green fleet
    const tg2 = testListener.addTargets('ECS2', {
      port: 80,
      targets: [ // empty to begin with
        new (class EmptyIpTarget implements elb.IApplicationLoadBalancerTarget {
          attachToApplicationTargetGroup(_: elb.ApplicationTargetGroup): elb.LoadBalancerTargetProps {
            return { targetType: elb.TargetType.IP };
          }
        })()
      ],
      deregistrationDelay: Duration.seconds(30),
      healthCheck: {
        interval: Duration.seconds(5),
        healthyHttpCodes: '200',
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        timeout: Duration.seconds(4)
      }
    });

    // Alarms: monitor 500s and unhealthy hosts on target groups
    const tg1UnhealthyHosts = new cloudwatch.Alarm(this, 'TargetGroupUnhealthyHosts', {
      alarmName: this.stackName + '-Unhealthy-Hosts-Blue',
      metric: tg1.metricUnhealthyHostCount(),
      threshold: 1,
      evaluationPeriods: 2,
    });

    const tg1ApiFailure = new cloudwatch.Alarm(this, 'TargetGroup5xx', {
      alarmName: this.stackName + '-Http-500-Blue',
      metric: tg1.metricHttpCodeTarget(
        elb.HttpCodeTarget.TARGET_5XX_COUNT,
        { period: Duration.minutes(1) },
      ),
      threshold: 1,
      evaluationPeriods: 1,
    });

    const tg2UnhealthyHosts = new cloudwatch.Alarm(this, 'TargetGroup2UnhealthyHosts', {
      alarmName: this.stackName + '-Unhealthy-Hosts-Green',
      metric: tg2.metricUnhealthyHostCount(),
      threshold: 1,
      evaluationPeriods: 2,
    });

    const tg2ApiFailure = new cloudwatch.Alarm(this, 'TargetGroup25xx', {
      alarmName: this.stackName + '-Http-500-Green',
      metric: tg1.metricHttpCodeTarget(
        elb.HttpCodeTarget.TARGET_5XX_COUNT,
        { period: Duration.minutes(1) },
      ),
      threshold: 1,
      evaluationPeriods: 1,
    });

    new cloudwatch.CompositeAlarm(this, 'CompositeUnhealthyHosts', {
      compositeAlarmName: this.stackName + '-Unhealthy-Hosts',
      alarmRule: cloudwatch.AlarmRule.anyOf(
        cloudwatch.AlarmRule.fromAlarm(tg1UnhealthyHosts, cloudwatch.AlarmState.ALARM),
        cloudwatch.AlarmRule.fromAlarm(tg2UnhealthyHosts, cloudwatch.AlarmState.ALARM))
    });

    new cloudwatch.CompositeAlarm(this, 'Composite5xx', {
      compositeAlarmName: this.stackName + '-Http-500',
      alarmRule: cloudwatch.AlarmRule.anyOf(
        cloudwatch.AlarmRule.fromAlarm(tg1ApiFailure, cloudwatch.AlarmState.ALARM),
        cloudwatch.AlarmRule.fromAlarm(tg2ApiFailure, cloudwatch.AlarmState.ALARM))
    });

    // Roles
    new iam.Role(this, 'ServiceTaskDefExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [ iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy') ]
    });

    new iam.Role(this, 'ServiceTaskDefTaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    new iam.Role(this, 'CodeDeployRole', {
      assumedBy: new iam.ServicePrincipal('codedeploy.amazonaws.com'),
      managedPolicies: [ iam.ManagedPolicy.fromAwsManagedPolicyName('AWSCodeDeployRoleForECS') ]
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
