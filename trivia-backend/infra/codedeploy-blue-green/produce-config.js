#!/usr/bin/env node

const aws = require('aws-sdk');
const fs = require('fs');

const argv = require('yargs')
    .usage('Create ECS/CodeDeploy config files with values from CloudFormation stack\nUsage: $0')
    .demandOption(['s', 'g', 'h'])
    .alias('s', 'stack-name')
    .alias('g', 'stage-name')
    .alias('h', 'hook-stack-name')
    .argv;

const deploymentGroupConfig = require('./deployment-group.json');
const taskDefConfig = require('./task-definition.json');
const serviceConfig = require('./service-definition.json');
const appSpec = require('./appspec.json');

const stack = argv.stackName;
const stage = argv.stageName;
const hookStack = argv.hookStackName;

const cfn = new aws.CloudFormation();
const sts = new aws.STS();

async function produceConfigs() {
    let data = await cfn.describeStackResources({ StackName: stack }).promise();
    let hookData = await cfn.describeStackResources({ StackName: hookStack }).promise();
    let identity = await sts.getCallerIdentity().promise();
    let accountId = identity.Account;

    // Make a whole bunch of assumptions about the contents of the CFN stack
    let targetGroupNames = [];
    let targetGroupArns = [];
    let mainTrafficListener;
    let testTrafficListener;
    let privateSubnets = [];
    let serviceSecurityGroups = [];
    let alarms = [];
    let taskRole;
    let executionRole;
    let codedeployRole;
    let preTrafficHook;

    for (const resource of data.StackResources) {
        if (resource.ResourceType == "AWS::CloudWatch::Alarm") {
            alarms.push({ name: resource.PhysicalResourceId });
        } else if (resource.ResourceType == "AWS::EC2::Subnet" &&
                    resource.LogicalResourceId.startsWith("VPCPrivateSubnet")) {
            privateSubnets.push(resource.PhysicalResourceId);
        } else if (resource.ResourceType == "AWS::ElasticLoadBalancingV2::TargetGroup") {
            targetGroupArns.push({ name: resource.PhysicalResourceId });
            targetGroupNames.push({ name: resource.PhysicalResourceId.split('/')[1] });
        } else if (resource.ResourceType == "AWS::ElasticLoadBalancingV2::Listener" &&
                    resource.LogicalResourceId.startsWith("ServiceLBPublicListener")) {
            mainTrafficListener = resource.PhysicalResourceId;
        } else if (resource.ResourceType == "AWS::ElasticLoadBalancingV2::Listener" &&
                    resource.LogicalResourceId.startsWith("ServiceLBTestListener")) {
            testTrafficListener = resource.PhysicalResourceId;
        } else if (resource.ResourceType == "AWS::EC2::SecurityGroup" &&
                    resource.LogicalResourceId.startsWith("ServiceSecurityGroup")) {
            serviceSecurityGroups.push(resource.PhysicalResourceId);
        } else if (resource.ResourceType == "AWS::IAM::Role" &&
                    resource.LogicalResourceId.startsWith("ServiceTaskDefExecutionRole")) {
            executionRole = resource.PhysicalResourceId;
        } else if (resource.ResourceType == "AWS::IAM::Role" &&
                    resource.LogicalResourceId.startsWith("ServiceTaskDefTaskRole")) {
            taskRole = resource.PhysicalResourceId;
        } else if (resource.ResourceType == "AWS::IAM::Role" &&
                    resource.LogicalResourceId.startsWith("CodeDeployRole")) {
            codedeployRole = resource.PhysicalResourceId;
        }
    }

    for (const resource of hookData.StackResources) {
        if (resource.LogicalResourceId == 'PreTrafficHook') {
            preTrafficHook = resource.PhysicalResourceId;
        }
    }

    // Write out deployment config
    deploymentGroupConfig.loadBalancerInfo.targetGroupPairInfoList[0].targetGroups = targetGroupNames;
    deploymentGroupConfig.loadBalancerInfo.targetGroupPairInfoList[0].prodTrafficRoute.listenerArns = [ mainTrafficListener ];
    deploymentGroupConfig.loadBalancerInfo.targetGroupPairInfoList[0].testTrafficRoute.listenerArns = [ testTrafficListener ];
    deploymentGroupConfig.alarmConfiguration.alarms = alarms;
    deploymentGroupConfig.ecsServices[0].serviceName = "trivia-backend-" + stage;
    deploymentGroupConfig.serviceRoleArn = `arn:aws:iam::${accountId}:role/${codedeployRole}`;
    deploymentGroupConfig.applicationName = "AppECS-default-trivia-backend-" + stage;
    fs.writeFileSync(`./build/deployment-group-${stage}.json`, JSON.stringify(deploymentGroupConfig, null, 2) , 'utf-8');

    // Write out task def config
    taskDefConfig.taskRoleArn = taskRole;
    taskDefConfig.executionRoleArn = executionRole;
    fs.writeFileSync(`./build/task-definition-${stage}.json`, JSON.stringify(taskDefConfig, null, 2) , 'utf-8');

    // Write out service config
    serviceConfig.loadBalancers[0].targetGroupArn = targetGroupArns[0].name;
    serviceConfig.networkConfiguration.awsvpcConfiguration.subnets = privateSubnets;
    serviceConfig.networkConfiguration.awsvpcConfiguration.securityGroups = serviceSecurityGroups;
    fs.writeFileSync(`./build/service-definition-${stage}.json`, JSON.stringify(serviceConfig, null, 2) , 'utf-8');

    // Write out appspec
    appSpec.Resources[0].TargetService.Properties.NetworkConfiguration.awsvpcConfiguration.subnets = privateSubnets;
    appSpec.Resources[0].TargetService.Properties.NetworkConfiguration.awsvpcConfiguration.securityGroups = serviceSecurityGroups;
    appSpec.Hooks[0].AfterAllowTestTraffic = preTrafficHook;
    fs.writeFileSync(`./build/appspec-${stage}.json`, JSON.stringify(appSpec, null, 2) , 'utf-8');
}

produceConfigs().catch(err => {
    console.error('There was an uncaught error', err);
    process.exit(1);
});
