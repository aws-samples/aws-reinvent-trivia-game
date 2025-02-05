import { App, CfnOutput, Duration, Fn, Stack, StackProps } from 'aws-cdk-lib';
import {
  aws_certificatemanager as acm,
  aws_cloudwatch as cloudwatch,
  aws_codedeploy as codedeploy,
  aws_ec2 as ec2,
  aws_elasticloadbalancingv2 as elb,
  aws_route53 as route53,
  aws_route53_targets as targets,
  aws_ssm as ssm,
} from 'aws-cdk-lib';

interface TriviaBackendStackProps extends StackProps {
  domainName?: string;
  domainZone?: string;
}

/**
 * Set up the infrastructure for the trivia backend, including VPC, load balancer, etc.
 */
class TriviaBackendStack extends Stack {
  constructor(parent: App, name: string, props: TriviaBackendStackProps) {
    super(parent, name, props);

    // Network infrastructure
    const vpc = new ec2.Vpc(this, 'VPC', { maxAzs: 2 });
    const serviceSG = new ec2.SecurityGroup(this, 'ServiceSecurityGroup', {
      vpc,
    });

    // Load balancer
    const loadBalancer = new elb.ApplicationLoadBalancer(this, 'ServiceLB', {
      vpc,
      internetFacing: true,
    });
    serviceSG.connections.allowFrom(loadBalancer, ec2.Port.tcp(80));

    // First target group for blue fleet
    const tg1 = new elb.ApplicationTargetGroup(this, 'BlueTargetGroup', {
      vpc,
      protocol: elb.ApplicationProtocol.HTTP,
      targetType: elb.TargetType.IP,
      port: 80,
      deregistrationDelay: Duration.seconds(30),
      healthCheck: {
        interval: Duration.seconds(5),
        healthyHttpCodes: '200',
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        timeout: Duration.seconds(4),
      },
    });

    // Second target group for green fleet
    const tg2 = new elb.ApplicationTargetGroup(this, 'GreenTargetGroup', {
      vpc,
      protocol: elb.ApplicationProtocol.HTTP,
      targetType: elb.TargetType.IP,
      port: 80,
      deregistrationDelay: Duration.seconds(30),
      healthCheck: {
        interval: Duration.seconds(5),
        healthyHttpCodes: '200',
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        timeout: Duration.seconds(4),
      },
    });

    let listener, testListener: elb.ApplicationListener;
    if (props.domainName && props.domainZone) {
      const domainZone = route53.HostedZone.fromLookup(this, 'Zone', {
        domainName: props.domainZone,
      });
      new route53.ARecord(this, 'DNS', {
        zone: domainZone,
        recordName: props.domainName,
        target: route53.RecordTarget.fromAlias(
          new targets.LoadBalancerTarget(loadBalancer)
        ),
      });

      // Lookup pre-existing TLS certificate
      const certificateArn = ssm.StringParameter.fromStringParameterAttributes(
        this,
        'CertArnParameter',
        {
          parameterName: 'CertificateArn-' + props.domainName,
        }
      ).stringValue;
      const certificate = acm.Certificate.fromCertificateArn(
        this,
        'Certificate',
        certificateArn
      );

      // Primary traffic listener
      listener = loadBalancer.addListener('PublicListener', {
        port: 443,
        protocol: elb.ApplicationProtocol.HTTPS,
        open: true,
        certificates: [certificate],
        sslPolicy: elb.SslPolicy.RECOMMENDED_TLS,
        defaultTargetGroups: [tg1],
      });

      // Second listener for test traffic
      testListener = loadBalancer.addListener('TestListener', {
        port: 9002, // port for testing
        protocol: elb.ApplicationProtocol.HTTPS,
        open: true,
        certificates: [certificate],
        sslPolicy: elb.SslPolicy.RECOMMENDED_TLS,
        defaultTargetGroups: [tg2],
      });
    } else {
      // Primary traffic listener
      listener = loadBalancer.addListener('PublicListener', {
        port: 80,
        protocol: elb.ApplicationProtocol.HTTP,
        open: true,
        defaultTargetGroups: [tg1],
      });

      // Second listener for test traffic
      testListener = loadBalancer.addListener('TestListener', {
        port: 9002, // port for testing
        protocol: elb.ApplicationProtocol.HTTP,
        open: true,
        defaultTargetGroups: [tg2],
      });
    }

    listener.node.addDependency(tg2);
    testListener.node.addDependency(tg1);

    // Alarms: monitor 500s and unhealthy hosts on target groups
    const tg1UnhealthyHosts = new cloudwatch.Alarm(
      this,
      'TargetGroupUnhealthyHosts',
      {
        alarmName: this.stackName + '-Unhealthy-Hosts-Blue',
        metric: tg1.metricUnhealthyHostCount(),
        threshold: 1,
        evaluationPeriods: 2,
      }
    );

    const tg1ApiFailure = new cloudwatch.Alarm(this, 'TargetGroup5xx', {
      alarmName: this.stackName + '-Http-500-Blue',
      metric: tg1.metricHttpCodeTarget(elb.HttpCodeTarget.TARGET_5XX_COUNT, {
        period: Duration.minutes(1),
      }),
      threshold: 1,
      evaluationPeriods: 1,
    });

    const tg2UnhealthyHosts = new cloudwatch.Alarm(
      this,
      'TargetGroup2UnhealthyHosts',
      {
        alarmName: this.stackName + '-Unhealthy-Hosts-Green',
        metric: tg2.metricUnhealthyHostCount(),
        threshold: 1,
        evaluationPeriods: 2,
      }
    );

    const tg2ApiFailure = new cloudwatch.Alarm(this, 'TargetGroup25xx', {
      alarmName: this.stackName + '-Http-500-Green',
      metric: tg1.metricHttpCodeTarget(elb.HttpCodeTarget.TARGET_5XX_COUNT, {
        period: Duration.minutes(1),
      }),
      threshold: 1,
      evaluationPeriods: 1,
    });

    new cloudwatch.CompositeAlarm(this, 'CompositeUnhealthyHosts', {
      compositeAlarmName: this.stackName + '-Unhealthy-Hosts',
      alarmRule: cloudwatch.AlarmRule.anyOf(
        cloudwatch.AlarmRule.fromAlarm(
          tg1UnhealthyHosts,
          cloudwatch.AlarmState.ALARM
        ),
        cloudwatch.AlarmRule.fromAlarm(
          tg2UnhealthyHosts,
          cloudwatch.AlarmState.ALARM
        )
      ),
    });

    new cloudwatch.CompositeAlarm(this, 'Composite5xx', {
      compositeAlarmName: this.stackName + '-Http-500',
      alarmRule: cloudwatch.AlarmRule.anyOf(
        cloudwatch.AlarmRule.fromAlarm(
          tg1ApiFailure,
          cloudwatch.AlarmState.ALARM
        ),
        cloudwatch.AlarmRule.fromAlarm(
          tg2ApiFailure,
          cloudwatch.AlarmState.ALARM
        )
      ),
    });

    // CodeDeploy Resources
    const ecsApp = new codedeploy.EcsApplication(
      this,
      'CodeDeployApplication',
      {
        applicationName: 'AppECS-' + this.stackName,
      }
    );

    // Export values to use in other stacks
    new CfnOutput(this, 'VPCOutput', {
      value: vpc.vpcId,
      exportName: this.stackName + 'Vpc',
    });
    new CfnOutput(this, 'LoadBalancerEndpoint', {
      value: loadBalancer.loadBalancerDnsName,
    });
    new CfnOutput(this, 'ServiceSecurityGroupOutput', {
      value: serviceSG.securityGroupId,
      exportName: this.stackName + 'ServiceSecurityGroup',
    });
    new CfnOutput(this, 'LoadBalancerSecurityGroupOutput', {
      value: Fn.select(0, loadBalancer.loadBalancerSecurityGroups),
      exportName: this.stackName + 'LoadBalancerSecurityGroup',
    });
    new CfnOutput(this, 'BlueTargetGroupOutput', {
      value: tg1.targetGroupArn,
      exportName: this.stackName + 'BlueTargetGroup',
    });
    new CfnOutput(this, 'GreenTargetGroupOutput', {
      value: tg2.targetGroupArn,
      exportName: this.stackName + 'GreenTargetGroup',
    });
    new CfnOutput(this, 'ProdTrafficListenerOutput', {
      value: listener.listenerArn,
      exportName: this.stackName + 'ProdTrafficListener',
    });
    new CfnOutput(this, 'TestTrafficListenerOutput', {
      value: testListener.listenerArn,
      exportName: this.stackName + 'TestTrafficListener',
    });
    new CfnOutput(this, 'BlueUnhealthyHostsAlarmOutput', {
      value: tg1UnhealthyHosts.alarmArn,
      exportName: this.stackName + 'BlueUnhealthyHostsAlarm',
    });
    new CfnOutput(this, 'BlueApiFailureAlarmOutput', {
      value: tg1ApiFailure.alarmArn,
      exportName: this.stackName + 'BlueApiFailureAlarm',
    });
    new CfnOutput(this, 'GreenUnhealthyHostsAlarmOutput', {
      value: tg2UnhealthyHosts.alarmArn,
      exportName: this.stackName + 'GreenUnhealthyHostsAlarm',
    });
    new CfnOutput(this, 'GreenApiFailureAlarmOutput', {
      value: tg2ApiFailure.alarmArn,
      exportName: this.stackName + 'GreenApiFailureAlarm',
    });
    new CfnOutput(this, 'CodeDeployApplicationOutput', {
      value: ecsApp.applicationName,
      exportName: this.stackName + 'CodeDeployApplication',
    });

    new ssm.StringParameter(this, 'VPCParam', {
      parameterName: `/${this.stackName}/VPC`,
      stringValue: vpc.vpcId,
    });
    new ssm.StringParameter(this, 'ServiceSecurityGroupParam', {
      parameterName: `/${this.stackName}/ServiceSecurityGroup`,
      stringValue: serviceSG.securityGroupId,
    });
  }
}

const app = new App();
new TriviaBackendStack(app, 'TriviaBackendTest', {
  domainName: 'api-test.reinvent-trivia.com',
  domainZone: 'reinvent-trivia.com',
  env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1' },
  tags: {
    project: 'reinvent-trivia',
  },
});
new TriviaBackendStack(app, 'TriviaBackendProd', {
  domainName: 'api.reinvent-trivia.com',
  domainZone: 'reinvent-trivia.com',
  env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1' },
  tags: {
    project: 'reinvent-trivia',
  },
});
app.synth();
