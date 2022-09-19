import { App, Fn, Stack, StackProps } from 'aws-cdk-lib';
import {
  aws_cloudwatch as cloudwatch,
  aws_codedeploy as codedeploy,
  aws_ec2 as ec2,
  aws_ecr as ecr,
  aws_ecs as ecs,
  aws_iam as iam,
  aws_elasticloadbalancingv2 as elbv2,
  aws_ssm as ssm,
} from 'aws-cdk-lib';

interface TriviaDeploymentResourcesStackProps extends StackProps {
  infrastructureStackName: string;
}

/**
 * Set up the resources needed to do blue-green deployments, including the ECS service and CodeDeploy deployment group.
 * This stack is effectively "create-only": once the ECS service is created, it cannot be updated through CloudFormation,
 * only through CodeDeploy.
 */
class TriviaDeploymentResourcesStack extends Stack {
  constructor(parent: App, name: string, props: TriviaDeploymentResourcesStackProps) {
    super(parent, name, props);

    // Lookup existing resources
    const repo = ecr.Repository.fromRepositoryName(this, 'Repo', 'reinvent-trivia-backend');
    const ecsApplication = codedeploy.EcsApplication.fromEcsApplicationName(
      this,
      'App',
      Fn.importValue(props.infrastructureStackName + 'CodeDeployApplication'),
    );
    const vpcId = ssm.StringParameter.valueFromLookup(this, `/${props.infrastructureStackName}/VPC`);
    const vpc = ec2.Vpc.fromLookup(this, 'Vpc', { vpcId });
    const cluster = ecs.Cluster.fromClusterAttributes(this, 'Cluster', {
      clusterName: 'default',
      vpc,
      securityGroups: [],
    });
    const serviceSGId = ssm.StringParameter.valueFromLookup(this, `/${props.infrastructureStackName}/ServiceSecurityGroup`);
    const serviceSG = ec2.SecurityGroup.fromLookupById(this, 'ServiceSG', serviceSGId);
    const blueTG = elbv2.ApplicationTargetGroup.fromTargetGroupAttributes(
      this,
      'BlueTG',
      {targetGroupArn: Fn.importValue(props.infrastructureStackName + 'BlueTargetGroup')},
    );
    const greenTG = elbv2.ApplicationTargetGroup.fromTargetGroupAttributes(
      this,
      'GreenTG',
      {targetGroupArn: Fn.importValue(props.infrastructureStackName + 'GreenTargetGroup')},
    );
    const lbSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      'LBSecurityGroup',
      Fn.importValue(props.infrastructureStackName + 'LoadBalancerSecurityGroup'),
      { allowAllOutbound: true },
    );
    const prodListener = elbv2.ApplicationListener.fromApplicationListenerAttributes(
      this,
      'ProdRoute',
      {
        listenerArn: Fn.importValue(props.infrastructureStackName + 'ProdTrafficListener'),
        securityGroup: lbSecurityGroup,
      },
    );
    const testListener = elbv2.ApplicationListener.fromApplicationListenerAttributes(
      this,
      'TestRoute',
      {
        listenerArn: Fn.importValue(props.infrastructureStackName + 'TestTrafficListener'),
        securityGroup: lbSecurityGroup,
      },
    );
    const blueUnhealthyHostsAlarm = cloudwatch.Alarm.fromAlarmArn(
      this,
      'BlueUnhealthyHostsAlarm',
      Fn.importValue(props.infrastructureStackName + 'BlueUnhealthyHostsAlarm'),
    );
    const blueApiFailureAlarm = cloudwatch.Alarm.fromAlarmArn(
      this,
      'BlueApiFailureAlarm',
      Fn.importValue(props.infrastructureStackName + 'BlueApiFailureAlarm'),
    );
    const greenUnhealthyHostsAlarm = cloudwatch.Alarm.fromAlarmArn(
      this,
      'GreenUnhealthyHostsAlarm',
      Fn.importValue(props.infrastructureStackName + 'GreenUnhealthyHostsAlarm'),
    );
    const greenApiFailureAlarm = cloudwatch.Alarm.fromAlarmArn(
      this,
      'GreenApiFailureAlarm',
      Fn.importValue(props.infrastructureStackName + 'GreenApiFailureAlarm'),
    );

    // ECS resources
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      family: 'trivia-backend',
    });
    taskDefinition.addContainer('Container', {
      containerName: 'web',
      image: ecs.ContainerImage.fromEcrRepository(repo, 'latest'),
      portMappings: [{
        protocol: ecs.Protocol.TCP,
        containerPort: 80,
        hostPort: 80,
      }],
    });
    const service = new ecs.FargateService(this, 'Service', {
      serviceName: props.infrastructureStackName,
      cluster,
      taskDefinition,
      securityGroups: [serviceSG],
      desiredCount: 3,
      deploymentController: {
        type: ecs.DeploymentControllerType.CODE_DEPLOY,
      },
      propagateTags: ecs.PropagatedTagSource.SERVICE,
    });
    service.attachToApplicationTargetGroup(blueTG);

    // CodeDeploy resources
    const codedeployRole = new iam.Role(this, 'CodeDeployRole', {
      assumedBy: new iam.ServicePrincipal('codedeploy.amazonaws.com'),
      managedPolicies: [ iam.ManagedPolicy.fromAwsManagedPolicyName('AWSCodeDeployRoleForECS') ]
    });

    const deploymentConfig = codedeploy.EcsDeploymentConfig.fromEcsDeploymentConfigName(this, 'DC', 'CodeDeployDefault.ECSCanary10Percent15Minutes');

    new codedeploy.CfnDeploymentGroup(this, 'DeploymentGroup', {
      applicationName: ecsApplication.applicationName,
      serviceRoleArn: codedeployRole.roleArn,
      deploymentGroupName: 'DgpECS-' + props.infrastructureStackName,
      deploymentConfigName: deploymentConfig.deploymentConfigName,
      deploymentStyle: {
        deploymentType: 'BLUE_GREEN',
        deploymentOption: 'WITH_TRAFFIC_CONTROL',
      },
      ecsServices: [
        {
          clusterName: cluster.clusterName,
          serviceName: service.serviceName,
        }
      ],
      blueGreenDeploymentConfiguration: {
        deploymentReadyOption: {
          actionOnTimeout: 'CONTINUE_DEPLOYMENT',
          waitTimeInMinutes: 0,
        },
        terminateBlueInstancesOnDeploymentSuccess: {
          action: 'TERMINATE',
          terminationWaitTimeInMinutes: 30,
        }
      },
      loadBalancerInfo: {
        targetGroupPairInfoList: [
          {
            targetGroups: [
              {
                name: blueTG.targetGroupName,
              },
              {
                name: greenTG.targetGroupName,
              }
            ],
            prodTrafficRoute: {
              listenerArns: [
                prodListener.listenerArn,
              ]
            },
            testTrafficRoute: {
              listenerArns: [
                testListener.listenerArn,
              ]
            }
          }
        ]
      },
      alarmConfiguration: {
        enabled: true,
        ignorePollAlarmFailure: false,
        alarms: [
          {
            name: blueUnhealthyHostsAlarm.alarmName,
          },
          {
            name: blueApiFailureAlarm.alarmName,
          },
          {
            name: greenUnhealthyHostsAlarm.alarmName,
          },
          {
            name: greenApiFailureAlarm.alarmName,
          },
        ],
      },
      autoRollbackConfiguration: {
        enabled: true,
        events: [
          'DEPLOYMENT_FAILURE',
          'DEPLOYMENT_STOP_ON_REQUEST',
          'DEPLOYMENT_STOP_ON_ALARM',
        ]
      },
    });
  }
}

const app = new App();
new TriviaDeploymentResourcesStack(app, 'TriviaDeploymentResourcesTest', {
  infrastructureStackName: 'TriviaBackendTest',
  env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1' },
  tags: {
      project: "reinvent-trivia"
  }
});
new TriviaDeploymentResourcesStack(app, 'TriviaDeploymentResourcesProd', {
  infrastructureStackName: 'TriviaBackendProd',
  env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1' },
  tags: {
      project: "reinvent-trivia"
  }
});
app.synth();
