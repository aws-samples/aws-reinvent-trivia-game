#!/usr/bin/env node
import {
  App,
  CfnOutput,
  Duration,
  Stack,
  StackProps,
} from 'aws-cdk-lib';
import {
  aws_certificatemanager as acm,
  aws_cloudwatch as cloudwatch,
  aws_ec2 as ec2,
  aws_ecr as ecr,
  aws_ecs as ecs,
  aws_elasticloadbalancingv2 as elb,
  aws_lambda_nodejs as lambda_nodejs,
  aws_lambda as lambda,
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

    // Look up container image to deploy
    const imageRepo = ecr.Repository.fromRepositoryName(
      this,
      'Repo',
      'reinvent-trivia-backend'
    );
    const tag = process.env.IMAGE_TAG ? process.env.IMAGE_TAG : 'latest';
    const image = ecs.ContainerImage.fromEcrRepository(imageRepo, tag);

    // Network infrastructure
    const vpc = new ec2.Vpc(this, 'VPC', { maxAzs: 2 });
    const cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: props.domainName.replace(/\./g, '-'),
      vpc,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });
    const serviceSG = new ec2.SecurityGroup(this, 'ServiceSecurityGroup', {
      vpc,
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

    // Public load balancer
    const loadBalancer = new elb.ApplicationLoadBalancer(this, 'LoadBalancer', {
      vpc,
      internetFacing: true,
    });
    serviceSG.connections.allowFrom(loadBalancer, ec2.Port.tcp(80));
    new CfnOutput(this, 'ServiceURL', {
      value: 'https://' + props.domainName + '/api/docs/',
    });
    new CfnOutput(this, 'LoadBalancerDnsName', {
      value: loadBalancer.loadBalancerDnsName,
    });

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

    // Target groups for blue-green deployment
    const blueTargetGroup = new elb.ApplicationTargetGroup(this, 'ServiceTargetGroupBlue', {
      port: 80,
      protocol: elb.ApplicationProtocol.HTTP,
      targetType: elb.TargetType.IP,
      vpc,
      deregistrationDelay: Duration.seconds(5),
      healthCheck: {
        interval: Duration.seconds(5),
        path: '/',
        protocol: elb.Protocol.HTTP,
        healthyHttpCodes: '200',
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        timeout: Duration.seconds(4),
      },
    });

    const greenTargetGroup = new elb.ApplicationTargetGroup(
      this,
      'ServiceTargetGroupGreen',
      {
        port: 80,
        protocol: elb.ApplicationProtocol.HTTP,
        targetType: elb.TargetType.IP,
        vpc,
        deregistrationDelay: Duration.seconds(5),
        healthCheck: {
          interval: Duration.seconds(5),
          path: '/',
          protocol: elb.Protocol.HTTP,
          healthyHttpCodes: '200',
          healthyThresholdCount: 2,
          unhealthyThresholdCount: 3,
          timeout: Duration.seconds(4),
        },
      }
    );

    const productionListener = loadBalancer.addListener('ProductionListener', {
      port: 443,
      protocol: elb.ApplicationProtocol.HTTPS,
      open: true,
      certificates: [certificate],
      sslPolicy: elb.SslPolicy.RECOMMENDED_TLS,
      defaultAction: elb.ListenerAction.fixedResponse(404, {
        contentType: 'text/plain',
        messageBody: 'Not Found',
      }),
    });

    const testListener = loadBalancer.addListener('TestListener', {
      port: 9002,
      protocol: elb.ApplicationProtocol.HTTPS,
      open: true,
      certificates: [certificate],
      sslPolicy: elb.SslPolicy.RECOMMENDED_TLS,
      defaultAction: elb.ListenerAction.fixedResponse(404, {
        contentType: 'text/plain',
        messageBody: 'Not Found',
      }),
    });

    // Lifecycle hook Lambda function that will test through the test listener port
    const preTrafficHook = new lambda_nodejs.NodejsFunction(this, 'PreTrafficHook', {
      entry: './ecs-post-test-traffic-hook.ts',
      timeout: Duration.minutes(5),
      environment: {
        TARGET_URL: `https://${props.domainName}:9002/api/trivia/all`,
      },
      runtime: lambda.Runtime.NODEJS_22_X,
    });

    // Task definition
    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      'TaskDefinition',
      {}
    );
    const container = taskDefinition.addContainer('web', {
      image,
      logging: new ecs.AwsLogDriver({ streamPrefix: 'Service' }),
    });
    container.addPortMappings({ containerPort: 80 });

    // ECS Service with native blue-green deployment
    const service = new ecs.FargateService(this, 'Service', {
      cluster,
      taskDefinition,
      desiredCount: 3,
      securityGroups: [serviceSG],
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      deploymentStrategy: ecs.DeploymentStrategy.BLUE_GREEN,
      bakeTime: Duration.minutes(30),
      propagateTags: ecs.PropagatedTagSource.SERVICE,
      deploymentAlarms: {
        alarmNames: [this.stackName + '-Http-500-Blue', this.stackName + '-Http-500-Green'],
        behavior: ecs.AlarmBehavior.ROLLBACK_ON_ALARM,
      },
      lifecycleHooks: [new ecs.DeploymentLifecycleLambdaTarget(preTrafficHook, 'PreTrafficHook', {
        lifecycleStages: [ecs.DeploymentLifecycleStage.POST_TEST_TRAFFIC_SHIFT],
      })],
      availabilityZoneRebalancing: ecs.AvailabilityZoneRebalancing.ENABLED,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
    });

    const productionRule = new elb.ApplicationListenerRule(this, 'ProductionRule', {
      listener: productionListener,
      priority: 1,
      conditions: [elb.ListenerCondition.pathPatterns(['*'])],
      action: elb.ListenerAction.weightedForward([
        {
          targetGroup: blueTargetGroup,
          weight: 100,
        },
        {
          targetGroup: greenTargetGroup,
          weight: 0,
        },
      ]),
    });

    const testRule = new elb.ApplicationListenerRule(this, 'TestRule', {
      listener: testListener,
      priority: 1,
      conditions: [elb.ListenerCondition.pathPatterns(['*'])],
      action: elb.ListenerAction.weightedForward([
        {
          targetGroup: blueTargetGroup,
          weight: 100,
        },
        {
          targetGroup: greenTargetGroup,
          weight: 0,
        },
      ]),
    });

    const alternateTarget = new ecs.AlternateTarget('GreenTarget', {
      alternateTargetGroup: greenTargetGroup,
      productionListener: ecs.ListenerRuleConfiguration.applicationListenerRule(productionRule),
      testListener: ecs.ListenerRuleConfiguration.applicationListenerRule(testRule),
    });

    const target = service.loadBalancerTarget({
      containerName: 'web',
      containerPort: 80,
      protocol: ecs.Protocol.TCP,
      alternateTarget,
    });

    target.attachToApplicationTargetGroup(blueTargetGroup);

    // Alarms for monitoring
    const blueApiFailure = new cloudwatch.Alarm(this, 'TargetGroupBlue5xx', {
      alarmName: this.stackName + '-Http-500-Blue',
      metric: blueTargetGroup.metrics.httpCodeTarget(
        elb.HttpCodeTarget.TARGET_5XX_COUNT,
        { period: Duration.minutes(1) }
      ),
      threshold: 1,
      evaluationPeriods: 1,
    });

    const greenApiFailure = new cloudwatch.Alarm(this, 'TargetGroupGreen5xx', {
      alarmName: this.stackName + '-Http-500-Green',
      metric: greenTargetGroup.metrics.httpCodeTarget(
        elb.HttpCodeTarget.TARGET_5XX_COUNT,
        { period: Duration.minutes(1) }
      ),
      threshold: 1,
      evaluationPeriods: 1,
    });

    const blueUnhealthyHosts = new cloudwatch.Alarm(
      this,
      'TargetGroupBlueUnhealthyHosts',
      {
        alarmName: this.stackName + '-Unhealthy-Hosts-Blue',
        metric: blueTargetGroup.metrics.unhealthyHostCount(),
        threshold: 1,
        evaluationPeriods: 2,
      }
    );

    const greenUnhealthyHosts = new cloudwatch.Alarm(
      this,
      'TargetGroupGreenUnhealthyHosts',
      {
        alarmName: this.stackName + '-Unhealthy-Hosts-Green',
        metric: greenTargetGroup.metrics.unhealthyHostCount(),
        threshold: 1,
        evaluationPeriods: 2,
      }
    );

    new cloudwatch.CompositeAlarm(this, 'CompositeUnhealthyHosts', {
      compositeAlarmName: this.stackName + '-Unhealthy-Hosts',
      alarmRule: cloudwatch.AlarmRule.anyOf(
        cloudwatch.AlarmRule.fromAlarm(
          blueUnhealthyHosts,
          cloudwatch.AlarmState.ALARM
        ),
        cloudwatch.AlarmRule.fromAlarm(
          greenUnhealthyHosts,
          cloudwatch.AlarmState.ALARM
        )
      ),
    });

    new cloudwatch.CompositeAlarm(this, 'Composite5xx', {
      compositeAlarmName: this.stackName + '-Http-500',
      alarmRule: cloudwatch.AlarmRule.anyOf(
        cloudwatch.AlarmRule.fromAlarm(
          blueApiFailure,
          cloudwatch.AlarmState.ALARM
        ),
        cloudwatch.AlarmRule.fromAlarm(
          greenApiFailure,
          cloudwatch.AlarmState.ALARM
        )
      ),
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
