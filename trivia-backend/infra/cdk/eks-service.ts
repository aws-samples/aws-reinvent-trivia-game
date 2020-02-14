#!/usr/bin/env node
import * as cdk from '@aws-cdk/core';
import {Certificate} from '@aws-cdk/aws-certificatemanager';
import {Vpc} from '@aws-cdk/aws-ec2';
import {Repository} from '@aws-cdk/aws-ecr';
import {FargateCluster, KubernetesResource} from '@aws-cdk/aws-eks';
import {ContainerImage} from '@aws-cdk/aws-ecs';
import {AccountRootPrincipal, Effect, FederatedPrincipal, ManagedPolicy, PolicyStatement, Role} from '@aws-cdk/aws-iam';
import {StringParameter} from '@aws-cdk/aws-ssm';
import {ReinventTriviaResource} from './eks/kubernetes-resources/reinvent-trivia';
import {AlbIngressControllerPolicy} from './eks/alb-ingress-controller-policy';
import {HostedZone} from '@aws-cdk/aws-route53';

interface TriviaBackendStackProps extends cdk.StackProps {
  domainName: string;
  domainZone: string;
  oidcProvider?: string;
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
      },
      mastersRole: new Role(this, 'ClusterAdminRole', {
        assumedBy: new AccountRootPrincipal(),
      }),
      outputClusterName: true,
      outputConfigCommand: true,
      outputMastersRoleArn: true,
      vpc,
    });
    const fargateProfile = cluster.node.findChild('fargate-profile-reinvent-trivia');

    // Configuration parameters
    const imageRepo = Repository.fromRepositoryName(this, 'Repo', 'reinvent-trivia-backend');
    const tag = (process.env.IMAGE_TAG) ? process.env.IMAGE_TAG : 'latest';
    const image = ContainerImage.fromEcrRepository(imageRepo, tag)

    // Lookup pre-existing TLS certificate
    const certificateArn = StringParameter.fromStringParameterAttributes(this, 'CertArnParameter', {
      parameterName: 'CertificateArn-' + props.domainName
    }).stringValue;
    const certificate = Certificate.fromCertificateArn(this, 'Cert', certificateArn);

    // Kubernetes resources for the ReinventTrivia namespace, deployment, service, etc.
    const reinventTrivia = new ReinventTriviaResource(this, 'ReinventTrivia', {
      cluster, certificate, image, domainName: props.domainName
    });
    reinventTrivia.node.addDependency(fargateProfile);

    const metricsServerChart = cluster.addChart('MetricsServer', {
      chart: 'metrics-server',
      release: 'metrics-server-rt',
      repository: 'https://kubernetes-charts.storage.googleapis.com',
      version: '2.9.0',
      namespace: 'kube-system'
    });
    metricsServerChart.node.addDependency(fargateProfile);

    // This "new class extends cdk.Construct {" convention wraps the resources created within and allows
    // us make all of them dependent on the EKS Cluster's Fargate Profile resource in one fell swoop. This
    // will prevent pods from being stuck in a "Pending" state forever after initial creation if Kubernetes
    // attempts to schedule them before the Fargate Profile is ready.
    new class extends cdk.Construct {
      constructor(parent: cdk.Construct, name: string) {
        super(parent, name)

        // This block creates the ALB Ingress Controller resources, but requires an OIDC provider in order
        // to function, which will not exist until the cluster creation is completed. After the initial
        // `cdk deploy` is complete, follow the README instructions on how to associate the OIDC provider
        // and complete the initial setup.
        if (props.oidcProvider) {
          const OIDC_PROVIDER = props.oidcProvider;
          const albIngressControllerRole = new Role(this, 'AlbIngressControllerRole', {
            assumedBy: new FederatedPrincipal(
              'arn:aws:iam::' + cdk.Stack.of(this).account + ':oidc-provider/' + props.oidcProvider, {
              'StringEquals': {
                [`${OIDC_PROVIDER + ':sub'}`]: 'system:serviceaccount:kube-system:aws-alb-ingress-controller'
              }
            },
              'sts:AssumeRoleWithWebIdentity'
            ),
            roleName: 'ReinventTriviaAlbIngressControllerRole',
            managedPolicies: [
              new AlbIngressControllerPolicy(this, 'AlbIngressControllerPolicy')
            ]
          });

          const albIngressChart = cluster.addChart('AlbIngress', {
            chart: 'aws-alb-ingress-controller',
            release: 'alb-ingress-controller-rt',
            repository: 'https://kubernetes-charts-incubator.storage.googleapis.com',
            version: '0.1.13',
            namespace: 'kube-system',
            values: {
              awsRegion: cdk.Stack.of(cluster).region,
              awsVpcID: cluster.vpc.vpcId,
              clusterName: cluster.clusterName,
              fullnameOverride: 'aws-alb-ingress-controller',
              rbac: {
                serviceAccountAnnotations: {
                  'eks.amazonaws.com/role-arn': albIngressControllerRole.roleArn
                }
              },
              scope: {
                singleNamespace: true,
                watchNamespace: 'reinvent-trivia',
              },
            },
          });
          albIngressChart.node.addDependency(metricsServerChart);

          new KubernetesResource(this, 'HorizontalPodAutoscaler', {
            cluster,
            manifest: [{
              apiVersion: 'autoscaling/v1',
              kind: 'HorizontalPodAutoscaler',
              metadata: {
                name: 'api',
                namespace: 'reinvent-trivia',
              },
              spec: {
                scaleTargetRef: {
                  apiVersion: 'apps/v1',
                  kind: 'Deployment',
                  name: 'api',
                },
                minReplicas: 2,
                maxReplicas: 32,
                targetCPUUtilizationPercentage: 50,
              }
            }]
          });

          if (props.domainZone) {
            const hostedZoneId = HostedZone.fromLookup(this, 'ApiDomainHostedZone', {domainName: props.domainZone}).hostedZoneId;
            const externalDnsRole = new Role(this, 'ExternalDnsRole', {
              assumedBy: new FederatedPrincipal(
                'arn:aws:iam::' + cdk.Stack.of(this).account + ':oidc-provider/' + props.oidcProvider, {
                'StringEquals': {
                  [`${OIDC_PROVIDER + ':sub'}`]: 'system:serviceaccount:kube-system:external-dns-rt'
                }
              },
                'sts:AssumeRoleWithWebIdentity'
              ),
              roleName: 'ReinventTriviaExternalDnsRole',
              managedPolicies: [
                new ManagedPolicy(this, 'ExternalDnsPolicy', {
                  managedPolicyName: 'ExternalDnsPolicy',
                  description: 'Used by the ExternalDNS pod to make AWS API calls for updating DNS',
                  statements: [
                    new PolicyStatement({
                      resources: ['arn:aws:route53:::hostedzone/' + hostedZoneId],
                      effect: Effect.ALLOW,
                      actions: [
                        "route53:ChangeResourceRecordSets"
                      ]
                    }),
                    new PolicyStatement({
                      resources: ['*'],
                      effect: Effect.ALLOW,
                      actions: [
                        'route53:ListHostedZones',
                        'route53:ListResourceRecordSets',
                      ]
                    })
                  ]
                })
              ]
            });
            const externalDnsChart = cluster.addChart('ExternalDns', {
              chart: 'external-dns',
              release: 'external-dns-rt',
              repository: 'https://kubernetes-charts.storage.googleapis.com',
              version: '2.16.2',
              namespace: 'kube-system',
              values: {
                domainFilters: [props.domainZone],
                namespace: 'reinvent-trivia',
                provider: 'aws',
                rbac: {
                  serviceAccountAnnotations: {
                    'eks.amazonaws.com/role-arn': externalDnsRole.roleArn,
                  }
                }
              }
            });
            externalDnsChart.node.addDependency(metricsServerChart);
          }
        }

      }
    }(this, 'KubernetesResources').node.addDependency(reinventTrivia);
  }
}

const app = new cdk.App();
new TriviaBackendStack(app, 'TriviaBackendProd', {
  domainName: 'api.reinvent-trivia.com',
  // NOTE: `domainZone` must already exist in Route 53.
  domainZone: 'reinvent-trivia.com',
  env: {account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1'},
  /*
   * NOTE: `oidcProvider` will not be available until after the cluster is deployed for the first
   * time. Leave the line below commented out for the initial `cdk deploy`. See README for details.
   */
  //oidcProvider: 'oidc.eks.<region>.amazonaws.com/id/<hexadecimal string>',
});
app.synth();
