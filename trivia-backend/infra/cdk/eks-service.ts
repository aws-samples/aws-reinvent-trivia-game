#!/usr/bin/env node
import * as cdk from '@aws-cdk/core';
import {Vpc} from '@aws-cdk/aws-ec2';
import {Repository} from '@aws-cdk/aws-ecr';
import {FargateCluster} from '@aws-cdk/aws-eks';
import {ContainerImage} from '@aws-cdk/aws-ecs';
import {AccountRootPrincipal, Role} from '@aws-cdk/aws-iam';
import {ReinventTriviaResource} from './eks/kubernetes-resources/reinvent-trivia';

interface TriviaBackendStackProps extends cdk.StackProps {
  domainName: string;
  domainZone: string;
}

class TriviaBackendStack extends cdk.Stack {
  constructor(parent: cdk.App, name: string, props: TriviaBackendStackProps) {
    super(parent, name, props);

    // Network infrastructure
    const vpc = new Vpc(this, 'VPC', {maxAzs: 2});

    // Initial creation of the cluster
    const cluster = new FargateCluster(this, 'FargateCluster', {
      clusterName: props.domainName.replace(/\./g, '-'),
      defaultProfile: {
        fargateProfileName: 'reinvent-trivia',
        selectors: [
          {namespace: 'default'},
          {namespace: 'kube-system'},
          {namespace: 'reinvent-trivia'},
        ],
        subnetSelection: {subnets: vpc.privateSubnets},
        vpc
      },
      mastersRole: new Role(this, 'ClusterAdminRole', {
        assumedBy: new AccountRootPrincipal(),
      }),
      outputClusterName: true,
      outputConfigCommand: true,
      outputMastersRoleArn: true,
      vpc,
    });

    // Configuration parameters
    const imageRepo = Repository.fromRepositoryName(this, 'Repo', 'reinvent-trivia-backend');
    const tag = (process.env.IMAGE_TAG) ? process.env.IMAGE_TAG : 'latest';
    const image = ContainerImage.fromEcrRepository(imageRepo, tag)

    // Kubernetes resources for the ReinventTrivia namespace, deployment, service, etc.
    new ReinventTriviaResource(this, 'ReinventTrivia', {cluster, image, domainName: props.domainName})
  }
}

const app = new cdk.App();
new TriviaBackendStack(app, 'TriviaBackendProd', {
  domainName: 'api.reinvent-trivia.com',
  domainZone: 'reinvent-trivia.com',
  env: {account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1'},
});
app.synth();
