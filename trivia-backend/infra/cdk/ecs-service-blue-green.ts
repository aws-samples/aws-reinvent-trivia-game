#!/usr/bin/env node
import {
  App,
  CfnCodeDeployBlueGreenHook,
  CfnOutput,
  CfnTrafficRoutingType,
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
  aws_route53 as route53,
  aws_route53_targets as targets,
  aws_ssm as ssm,
} from 'aws-cdk-lib';

interface TriviaBackendStackProps extends StackProps {
  domainName: string;
  domainZone: string;
  deploymentHooksStack: string;
}

/**
 * Always use the "cdk --no-version-reporting" flag with this example.
 * The CodeDeploy template hook prevents changes to the ECS resources and changes to non-ECS resources
 * from occurring in the same stack update, because the stack update cannot be done in a safe blue-green
 * fashion.  By default, the CDK inserts a `AWS::CDK::Metadata` resource into the template it generates.
 * If not using the `--no-version-reporting` option and the CDK libraries are upgraded, the
 * `AWS::CDK::Metadata` resource will change and can result in a validation error from the CodeDeploy hook
 * about non-ECS resource changes.
 */
class TriviaBackendStack extends Stack {
  constructor(parent: App, name: string, props: TriviaBackendStackProps) {
    super(parent, name, props);

    // Look up container image to deploy.
    // Note that the image tag MUST be static in the generated CloudFormation template
    // (for example, the tag value cannot come from a CFN stack parameter), or else CodeDeploy
    // will not recognize when the tag changes and will not orchestrate any blue-green deployments.
    const imageRepo = ecr.Repository.fromRepositoryName(
      this,
      'Repo',
      'reinvent-trivia-backend'
    );
    const tag = process.env.IMAGE_TAG ? process.env.IMAGE_TAG : 'latest';
    const image = ecs.ContainerImage.fromEcrRepository(imageRepo, tag);

    // Network infrastructure
    //
    // Note: Generally, the best practice is to minimize the number of resources in the template that
    // are not involved in the CodeDeploy blue-green deployment (i.e. that are not referenced by the
    // CodeDeploy blue-green hook). As mentioned above, the CodeDeploy hook prevents stack updates
    // that combine 'infrastructure' resource changes and 'blue-green' resource changes. Separating
    // infrastructure resources like VPC, security groups, clusters, etc into a different stack and
    // then referencing them in this stack would minimize the likelihood of that happening. But, for
    // the simplicity of this example, these resources are all created in the same stack.
    const vpc = new ec2.Vpc(this, 'VPC', { maxAzs: 2 });
    const cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: props.domainName.replace(/\./g, '-'),
      vpc,
      containerInsights: true,
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

    // Target groups:
    // We need two target groups that the ECS containers can be registered to.
    // CodeDeploy will shift traffic between these two target groups.
    const tg1 = new elb.ApplicationTargetGroup(this, 'ServiceTargetGroupBlue', {
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

    const tg2 = new elb.ApplicationTargetGroup(
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

    // Listeners:
    // CodeDeploy will shift traffic from blue to green and vice-versa
    // in both the production and test listeners.
    // The production listener is used for normal, production traffic.
    // The test listener is used for test traffic, like integration tests
    // which can run as part of a CodeDeploy lifecycle event hook prior to
    // traffic being shifted in the production listener.
    // Both listeners initially point towards the blue target group.
    const listener = loadBalancer.addListener('ProductionListener', {
      port: 443,
      protocol: elb.ApplicationProtocol.HTTPS,
      open: true,
      certificates: [certificate],
      sslPolicy: elb.SslPolicy.RECOMMENDED_TLS,
      defaultAction: elb.ListenerAction.weightedForward([
        {
          targetGroup: tg1,
          weight: 100,
        },
      ]),
    });

    let testListener = loadBalancer.addListener('TestListener', {
      port: 9002, // test traffic port
      protocol: elb.ApplicationProtocol.HTTPS,
      open: true,
      certificates: [certificate],
      sslPolicy: elb.SslPolicy.RECOMMENDED_TLS,
      defaultAction: elb.ListenerAction.weightedForward([
        {
          targetGroup: tg1,
          weight: 100,
        },
      ]),
    });

    // ECS Resources: task definition, service, task set, etc
    // The CodeDeploy blue-green hook will take care of orchestrating the sequence of steps
    // that CloudFormation takes during the deployment: the creation of the 'green' task set,
    // shifting traffic to the new task set, and draining/deleting the 'blue' task set.
    // The 'blue' task set is initially provisioned, pointing to the 'blue' target group.
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

    const service = new ecs.CfnService(this, 'Service', {
      cluster: cluster.clusterName,
      desiredCount: 3,
      deploymentController: { type: ecs.DeploymentControllerType.EXTERNAL },
      propagateTags: ecs.PropagatedTagSource.SERVICE,
      availabilityZoneRebalancing: 'ENABLED',
    });
    service.node.addDependency(tg1);
    service.node.addDependency(tg2);
    service.node.addDependency(listener);
    service.node.addDependency(testListener);

    const taskSet = new ecs.CfnTaskSet(this, 'TaskSet', {
      cluster: cluster.clusterName,
      service: service.attrName,
      scale: { unit: 'PERCENT', value: 100 },
      taskDefinition: taskDefinition.taskDefinitionArn,
      launchType: ecs.LaunchType.FARGATE,
      loadBalancers: [
        {
          containerName: 'web',
          containerPort: 80,
          targetGroupArn: tg1.targetGroupArn,
        },
      ],
      networkConfiguration: {
        awsVpcConfiguration: {
          assignPublicIp: 'DISABLED',
          securityGroups: [serviceSG.securityGroupId],
          subnets: vpc.selectSubnets({
            subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
          }).subnetIds,
        },
      },
    });

    new ecs.CfnPrimaryTaskSet(this, 'PrimaryTaskSet', {
      cluster: cluster.clusterName,
      service: service.attrName,
      taskSetId: taskSet.attrId,
    });

    // CodeDeploy hook and transform to configure the blue-green deployments.
    //
    // Note: Stack updates that contain changes in the template to both ECS resources and non-ECS resources
    // will result in the following error from the CodeDeploy hook:
    //   "Additional resource diff other than ECS application related resource update is detected,
    //    CodeDeploy can't perform BlueGreen style update properly."
    // In this case, you can either:
    // 1) Separate the resources into multiple, separate stack updates: First, deploy the changes to the
    //    non-ECS resources only, using the same container image tag during the template synthesis that is
    //    currently deployed to the ECS service.  Then, deploy the changes to the ECS service, for example
    //    deploying a new container image tag.  This is the best practice.
    // 2) Temporarily disable the CodeDeploy blue-green hook: Comment out the CodeDeploy transform and hook
    //    code below.  The next stack update will *not* deploy the ECS service changes in a blue-green fashion.
    //    Once the stack update is completed, uncomment the CodeDeploy transform and hook code to re-enable
    //    blue-green deployments.
    this.addTransform('AWS::CodeDeployBlueGreen');
    const taskDefLogicalId = this.getLogicalId(
      taskDefinition.node.defaultChild as ecs.CfnTaskDefinition
    );
    const taskSetLogicalId = this.getLogicalId(taskSet);
    new CfnCodeDeployBlueGreenHook(this, 'CodeDeployBlueGreenHook', {
      trafficRoutingConfig: {
        type: CfnTrafficRoutingType.TIME_BASED_CANARY,
        timeBasedCanary: {
          // Shift 20% of prod traffic, then wait 15 minutes
          stepPercentage: 20,
          bakeTimeMins: 15,
        },
      },
      additionalOptions: {
        // After canary period, shift 100% of prod traffic, then wait 30 minutes
        terminationWaitTimeInMinutes: 30,
      },
      lifecycleEventHooks: {
        // invoke lifecycle event hook function after test traffic is live, but before prod traffic is live
        afterAllowTestTraffic:
          'CodeDeployHook_-' + props.deploymentHooksStack + '-pre-traffic-hook',
      },
      serviceRole: 'CodeDeployHookRole_' + props.deploymentHooksStack,
      applications: [
        {
          target: {
            type: service.cfnResourceType,
            logicalId: this.getLogicalId(service),
          },
          ecsAttributes: {
            taskDefinitions: [taskDefLogicalId, taskDefLogicalId + 'Green'],
            taskSets: [taskSetLogicalId, taskSetLogicalId + 'Green'],
            trafficRouting: {
              prodTrafficRoute: {
                type: elb.CfnListener.CFN_RESOURCE_TYPE_NAME,
                logicalId: this.getLogicalId(
                  listener.node.defaultChild as elb.CfnListener
                ),
              },
              testTrafficRoute: {
                type: elb.CfnListener.CFN_RESOURCE_TYPE_NAME,
                logicalId: this.getLogicalId(
                  testListener.node.defaultChild as elb.CfnListener
                ),
              },
              targetGroups: [
                this.getLogicalId(tg1.node.defaultChild as elb.CfnTargetGroup),
                this.getLogicalId(tg2.node.defaultChild as elb.CfnTargetGroup),
              ],
            },
          },
        },
      ],
    });

    // Alarms:
    // These resources alarm on unhealthy hosts and HTTP 500s at the target group level.
    // In order to have stack updates automatically rollback based on these alarms,
    // the alarms need to manually be configured as rollback triggers on the stack
    // after the stack is created.
    const tg1UnhealthyHosts = new cloudwatch.Alarm(
      this,
      'TargetGroupBlueUnhealthyHosts',
      {
        alarmName: this.stackName + '-Unhealthy-Hosts-Blue',
        metric: new cloudwatch.Metric({
          namespace: 'AWS/ApplicationELB',
          metricName: 'UnHealthyHostCount',
          statistic: 'Average',
          dimensionsMap: {
            TargetGroup: tg1.targetGroupFullName,
            LoadBalancer: loadBalancer.loadBalancerFullName,
          },
        }),
        threshold: 1,
        evaluationPeriods: 2,
      }
    );

    const tg1ApiFailure = new cloudwatch.Alarm(this, 'TargetGroupBlue5xx', {
      alarmName: this.stackName + '-Http-500-Blue',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApplicationELB',
        metricName: elb.HttpCodeTarget.TARGET_5XX_COUNT,
        statistic: 'Sum',
        dimensionsMap: {
          TargetGroup: tg1.targetGroupFullName,
          LoadBalancer: loadBalancer.loadBalancerFullName,
        },
        period: Duration.minutes(1),
      }),
      threshold: 1,
      evaluationPeriods: 1,
    });

    const tg2UnhealthyHosts = new cloudwatch.Alarm(
      this,
      'TargetGroupGreenUnhealthyHosts',
      {
        alarmName: this.stackName + '-Unhealthy-Hosts-Green',
        metric: new cloudwatch.Metric({
          namespace: 'AWS/ApplicationELB',
          metricName: 'UnHealthyHostCount',
          statistic: 'Average',
          dimensionsMap: {
            TargetGroup: tg2.targetGroupFullName,
            LoadBalancer: loadBalancer.loadBalancerFullName,
          },
        }),
        threshold: 1,
        evaluationPeriods: 2,
      }
    );

    const tg2ApiFailure = new cloudwatch.Alarm(this, 'TargetGroupGreen5xx', {
      alarmName: this.stackName + '-Http-500-Green',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApplicationELB',
        metricName: elb.HttpCodeTarget.TARGET_5XX_COUNT,
        statistic: 'Sum',
        dimensionsMap: {
          TargetGroup: tg2.targetGroupFullName,
          LoadBalancer: loadBalancer.loadBalancerFullName,
        },
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
  }
}

const app = new App();
new TriviaBackendStack(app, 'TriviaBackendTest', {
  domainName: 'api-test.reinvent-trivia.com',
  domainZone: 'reinvent-trivia.com',
  deploymentHooksStack: 'TriviaBackendHooksTest',
  env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1' },
  tags: {
    project: 'reinvent-trivia',
  },
});
new TriviaBackendStack(app, 'TriviaBackendProd', {
  domainName: 'api.reinvent-trivia.com',
  domainZone: 'reinvent-trivia.com',
  deploymentHooksStack: 'TriviaBackendHooksProd',
  env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1' },
  tags: {
    project: 'reinvent-trivia',
  },
});
app.synth();
