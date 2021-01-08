#!/usr/bin/env node
import { Alarm, Metric } from '@aws-cdk/aws-cloudwatch';
import { Port, SecurityGroup, SubnetType, Vpc } from '@aws-cdk/aws-ec2';
import { Repository } from '@aws-cdk/aws-ecr';
import { AwsLogDriver, CfnPrimaryTaskSet, CfnService, CfnTaskDefinition, CfnTaskSet, Cluster, ContainerImage, DeploymentControllerType, FargateTaskDefinition, LaunchType, PropagatedTagSource } from '@aws-cdk/aws-ecs';
import { ApplicationLoadBalancer, ApplicationProtocol, ApplicationTargetGroup, CfnListener, CfnTargetGroup, HttpCodeTarget, ListenerAction, Protocol, TargetType } from '@aws-cdk/aws-elasticloadbalancingv2';
import { RecordTarget, ARecord, HostedZone } from '@aws-cdk/aws-route53';
import { LoadBalancerTarget } from '@aws-cdk/aws-route53-targets';
import { StringParameter } from '@aws-cdk/aws-ssm';
import cdk = require('@aws-cdk/core');

interface TriviaBackendStackProps extends cdk.StackProps {
  domainName: string;
  domainZone: string;
  deploymentHooksStack: string;
}

class TriviaBackendStack extends cdk.Stack {
  constructor(parent: cdk.App, name: string, props: TriviaBackendStackProps) {
    super(parent, name, props);

    // Look up container image to deploy.
    // Note that the image tag MUST be static in the generated CloudFormation template
    // (for example, the tag value cannot come from a CFN stack parameter), or else CodeDeploy
    // will not recognize when the tag changes and will not orchestrate any blue-green deployments.
    const imageRepo = Repository.fromRepositoryName(this, 'Repo', 'reinvent-trivia-backend');
    const tag = (process.env.IMAGE_TAG) ? process.env.IMAGE_TAG : 'latest';
    const image = ContainerImage.fromEcrRepository(imageRepo, tag)

    // Network infrastructure
    const vpc = new Vpc(this, 'VPC', { maxAzs: 2 });
    const cluster = new Cluster(this, 'Cluster', {
      clusterName: props.domainName.replace(/\./g, '-'),
      vpc,
      containerInsights: true
    });
    const serviceSG = new SecurityGroup(this, 'ServiceSecurityGroup', { vpc });

    // Lookup pre-existing TLS certificate
    const certificateArn = StringParameter.fromStringParameterAttributes(this, 'CertArnParameter', {
      parameterName: 'CertificateArn-' + props.domainName
    }).stringValue;

    // Public load balancer
    const loadBalancer = new ApplicationLoadBalancer(this, 'LoadBalancer', {
      vpc,
      internetFacing: true
    });
    serviceSG.connections.allowFrom(loadBalancer, Port.tcp(80));
    new cdk.CfnOutput(this, 'ServiceURL', { value: 'https://' + props.domainName + '/api/docs/'});
    new cdk.CfnOutput(this, 'LoadBalancerDnsName', { value: loadBalancer.loadBalancerDnsName });

    const domainZone = HostedZone.fromLookup(this, 'Zone', { domainName: props.domainZone });
    new ARecord(this, 'DNS', {
      zone: domainZone,
      recordName: props.domainName,
      target: RecordTarget.fromAlias(new LoadBalancerTarget(loadBalancer)),
    });

    // Target groups:
    // We need two target groups that the ECS containers can be registered to.
    // CodeDeploy will shift traffic between these two target groups.
    const tg1 = new ApplicationTargetGroup(this, 'ServiceTargetGroupBlue', {
      port: 80,
      protocol: ApplicationProtocol.HTTP,
      targetType: TargetType.IP,
      vpc,
      deregistrationDelay: cdk.Duration.seconds(5),
      healthCheck: {
        interval: cdk.Duration.seconds(5),
        path: '/',
        protocol: Protocol.HTTP,
        healthyHttpCodes: '200',
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        timeout: cdk.Duration.seconds(4)
      }
    });

    const tg2 = new ApplicationTargetGroup(this, 'ServiceTargetGroupGreen', {
      port: 80,
      protocol: ApplicationProtocol.HTTP,
      targetType: TargetType.IP,
      vpc,
      deregistrationDelay: cdk.Duration.seconds(5),
      healthCheck: {
        interval: cdk.Duration.seconds(5),
        path: '/',
        protocol: Protocol.HTTP,
        healthyHttpCodes: '200',
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        timeout: cdk.Duration.seconds(4)
      }
    });

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
      protocol: ApplicationProtocol.HTTPS,
      open: true,
      certificateArns: [certificateArn],
      defaultAction: ListenerAction.weightedForward([{
        targetGroup: tg1,
        weight: 100
      }])
    });

    let testListener = loadBalancer.addListener('TestListener', {
      port: 9002, // test traffic port
      protocol: ApplicationProtocol.HTTPS,
      open: true,
      certificateArns: [certificateArn],
      defaultAction: ListenerAction.weightedForward([{
        targetGroup: tg1,
        weight: 100
      }])
    });

    // ECS Resources: task definition, service, task set, etc
    // The CodeDeploy blue-green hook will take care of orchestrating the sequence of steps
    // that CloudFormation takes during the deployment: the creation of the 'green' task set,
    // shifting traffic to the new task set, and draining/deleting the 'blue' task set.
    // The 'blue' task set is initially provisioned, pointing to the 'blue' target group.
    const taskDefinition = new FargateTaskDefinition(this, 'TaskDefinition', {});
    const container = taskDefinition.addContainer('web', {
      image,
      logging: new AwsLogDriver({ streamPrefix: 'Service' }),
    });
    container.addPortMappings({ containerPort: 80 });

    const service = new CfnService(this, 'Service', {
      cluster: cluster.clusterName,
      desiredCount: 3,
      deploymentController: { type: DeploymentControllerType.EXTERNAL },
      propagateTags: PropagatedTagSource.SERVICE,
    });
    service.node.addDependency(tg1);
    service.node.addDependency(tg2);
    service.node.addDependency(listener);
    service.node.addDependency(testListener);

    const taskSet = new CfnTaskSet(this, 'TaskSet', {
      cluster: cluster.clusterName,
      service: service.attrName,
      scale: { unit: 'PERCENT', value: 100 },
      taskDefinition: taskDefinition.taskDefinitionArn,
      launchType: LaunchType.FARGATE,
      loadBalancers: [
        {
          containerName: 'web',
          containerPort: 80,
          targetGroupArn: tg1.targetGroupArn,
        }
      ],
      networkConfiguration: {
        awsVpcConfiguration: {
          assignPublicIp: 'DISABLED',
          securityGroups: [ serviceSG.securityGroupId ],
          subnets: vpc.selectSubnets({ subnetType: SubnetType.PRIVATE }).subnetIds,
        }
      },
    });

    new CfnPrimaryTaskSet(this, 'PrimaryTaskSet', {
      cluster: cluster.clusterName,
      service: service.attrName,
      taskSetId: taskSet.attrId,
    });

    // CodeDeploy hook and transform to configure the blue-green deployments.
    this.addTransform('AWS::CodeDeployBlueGreen');
    const taskDefLogicalId = this.getLogicalId(taskDefinition.node.defaultChild as CfnTaskDefinition)
    const taskSetLogicalId = this.getLogicalId(taskSet)
    new cdk.CfnCodeDeployBlueGreenHook(this, 'CodeDeployBlueGreenHook', {
      trafficRoutingConfig: {
        type: cdk.CfnTrafficRoutingType.TIME_BASED_CANARY,
        timeBasedCanary: {
          // Shift 20% of prod traffic, then wait 15 minutes
          stepPercentage: 20,
          bakeTimeMins: 15
        }
      },
      additionalOptions: {
        // After canary period, shift 100% of prod traffic, then wait 30 minutes
        terminationWaitTimeInMinutes: 30
      },
      lifecycleEventHooks: {
        // invoke lifecycle event hook function after test traffic is live, but before prod traffic is live
        afterAllowTestTraffic: 'CodeDeployHook_-' + props.deploymentHooksStack + '-pre-traffic-hook'
      },
      serviceRole: 'CodeDeployHookRole_' + props.deploymentHooksStack,
      applications: [{
        target: {
          type: service.cfnResourceType,
          logicalId: this.getLogicalId(service)
        },
        ecsAttributes: {
          taskDefinitions: [ taskDefLogicalId, taskDefLogicalId + 'Green' ],
          taskSets: [ taskSetLogicalId, taskSetLogicalId + 'Green' ],
          trafficRouting: {
            prodTrafficRoute: {
              type: CfnListener.CFN_RESOURCE_TYPE_NAME,
              logicalId: this.getLogicalId(listener.node.defaultChild as CfnListener)
            },
            testTrafficRoute: {
              type: CfnListener.CFN_RESOURCE_TYPE_NAME,
              logicalId: this.getLogicalId(testListener.node.defaultChild as CfnListener)
            },
            targetGroups: [
              this.getLogicalId(tg1.node.defaultChild as CfnTargetGroup),
              this.getLogicalId(tg2.node.defaultChild as CfnTargetGroup)
            ]
          }
        }
      }]
    });

    // Alarms:
    // These resources alarm on unhealthy hosts and HTTP 500s at the target group level.
    // In order to have stack updates automatically rollback based on these alarms,
    // the alarms need to manually be configured as rollback triggers on the stack
    // after the stack is created.
    new Alarm(this, 'TargetGroupBlueUnhealthyHosts', {
      alarmName: this.stackName + '-Unhealthy-Hosts-Blue',
      metric: new Metric({
        namespace: 'AWS/ApplicationELB',
        metricName: 'UnHealthyHostCount',
        statistic: 'Average',
        dimensions: {
          TargetGroup: tg1.targetGroupFullName,
          LoadBalancer: loadBalancer.loadBalancerFullName,
        },
      }),
      threshold: 1,
      evaluationPeriods: 2,
    });

    new Alarm(this, 'TargetGroupBlue5xx', {
      alarmName: this.stackName + '-Http-500-Blue',
      metric: new Metric({
        namespace: 'AWS/ApplicationELB',
        metricName: HttpCodeTarget.TARGET_5XX_COUNT,
        statistic: 'Sum',
        dimensions: {
          TargetGroup: tg1.targetGroupFullName,
          LoadBalancer: loadBalancer.loadBalancerFullName,
        },
      }),
      threshold: 1,
      evaluationPeriods: 1,
      period: cdk.Duration.minutes(1)
    });

    new Alarm(this, 'TargetGroupGreenUnhealthyHosts', {
      alarmName: this.stackName + '-Unhealthy-Hosts-Green',
      metric: new Metric({
        namespace: 'AWS/ApplicationELB',
        metricName: 'UnHealthyHostCount',
        statistic: 'Average',
        dimensions: {
          TargetGroup: tg2.targetGroupFullName,
          LoadBalancer: loadBalancer.loadBalancerFullName,
        },
      }),
      threshold: 1,
      evaluationPeriods: 2,
    });

    new Alarm(this, 'TargetGroupGreen5xx', {
      alarmName: this.stackName + '-Http-500-Green',
      metric: new Metric({
        namespace: 'AWS/ApplicationELB',
        metricName: HttpCodeTarget.TARGET_5XX_COUNT,
        statistic: 'Sum',
        dimensions: {
          TargetGroup: tg2.targetGroupFullName,
          LoadBalancer: loadBalancer.loadBalancerFullName,
        },
      }),
      threshold: 1,
      evaluationPeriods: 1,
      period: cdk.Duration.minutes(1)
    });
  }
}

const app = new cdk.App();
new TriviaBackendStack(app, 'TriviaBackendTest', {
  domainName: 'api-test.reinvent-trivia.com',
  domainZone: 'reinvent-trivia.com',
  deploymentHooksStack: 'TriviaBackendHooksTest',
  env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1' },
  tags: {
      project: 'reinvent-trivia'
  }
});
new TriviaBackendStack(app, 'TriviaBackendProd', {
  domainName: 'api.reinvent-trivia.com',
  domainZone: 'reinvent-trivia.com',
  deploymentHooksStack: 'TriviaBackendHooksProd',
  env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1' },
  tags: {
      project: 'reinvent-trivia'
  }
});
app.synth();
