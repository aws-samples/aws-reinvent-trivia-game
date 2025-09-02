#!/usr/bin/env node
import { Construct } from 'constructs';
import { App, Stack, StackProps } from 'aws-cdk-lib';
import {
  aws_certificatemanager as acm,
  aws_ec2 as ec2,
  aws_ecr as ecr,
  aws_ecs as ecs,
  aws_eks as eks,
  aws_iam as iam,
  aws_route53 as route53,
  aws_ssm as ssm,
} from 'aws-cdk-lib';
import { KubectlV32Layer } from '@aws-cdk/lambda-layer-kubectl-v32';
import {ReinventTriviaResource} from './eks/kubernetes-resources/reinvent-trivia';
import {AlbIngressControllerPolicy} from './eks/alb-ingress-controller-policy';

interface TriviaBackendStackProps extends StackProps {
  domainName: string;
  domainZone: string;
  oidcProvider?: string;
}

class TriviaBackendStack extends Stack {
  constructor(parent: App, name: string, props: TriviaBackendStackProps) {
    super(parent, name, props);

    // Network infrastructure
    const vpc = new ec2.Vpc(this, 'VPC', {maxAzs: 2});

    // Initial creation of the cluster
    const cluster = new eks.FargateCluster(this, 'FargateCluster', {
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
      mastersRole: new iam.Role(this, 'ClusterAdminRole', {
        assumedBy: new iam.AccountRootPrincipal(),
      }),
      outputClusterName: true,
      outputConfigCommand: true,
      outputMastersRoleArn: true,
      vpc,
      version: eks.KubernetesVersion.V1_32,
      kubectlLayer: new KubectlV32Layer(this, 'kubectl'),
    });
    const fargateProfile = cluster.node.findChild('fargate-profile-reinvent-trivia');

    // Configuration parameters
    const imageRepo = ecr.Repository.fromRepositoryName(this, 'Repo', 'reinvent-trivia-backend');
    const tag = (process.env.IMAGE_TAG) ? process.env.IMAGE_TAG : 'latest';
    const image = ecs.ContainerImage.fromEcrRepository(imageRepo, tag)

    // Lookup pre-existing TLS certificate
    const certificateArn = ssm.StringParameter.fromStringParameterAttributes(this, 'CertArnParameter', {
      parameterName: 'CertificateArn-' + props.domainName
    }).stringValue;
    const certificate = acm.Certificate.fromCertificateArn(this, 'Cert', certificateArn);

    // Kubernetes resources for the ReinventTrivia namespace, deployment, service, etc.
    const reinventTrivia = new ReinventTriviaResource(this, 'ReinventTrivia', {
      cluster, certificate, image, domainName: props.domainName
    });
    reinventTrivia.node.addDependency(fargateProfile);

    const metricsServerChart = cluster.addHelmChart('MetricsServer', {
      chart: 'metrics-server',
      release: 'metrics-server-rt',
      repository: 'https://kubernetes-sigs.github.io/metrics-server/',
      version: '3.12.2',
      namespace: 'kube-system'
    });
    metricsServerChart.node.addDependency(fargateProfile);

    // This "new class extends Construct {" convention wraps the resources created within and allows
    // us make all of them dependent on the EKS Cluster's Fargate Profile resource in one fell swoop. This
    // will prevent pods from being stuck in a "Pending" state forever after initial creation if Kubernetes
    // attempts to schedule them before the Fargate Profile is ready.
    new class extends Construct {
      constructor(parent: Construct, name: string) {
        super(parent, name)

        // This block creates the ALB Ingress Controller resources, but requires an OIDC provider in order
        // to function, which will not exist until the cluster creation is completed. After the initial
        // `cdk deploy` is complete, follow the README instructions on how to associate the OIDC provider
        // and complete the initial setup.
        if (props.oidcProvider) {
          const OIDC_PROVIDER = props.oidcProvider;
          const albIngressControllerRole = new iam.Role(this, 'AlbIngressControllerRole', {
            assumedBy: new iam.FederatedPrincipal(
              'arn:aws:iam::' + Stack.of(this).account + ':oidc-provider/' + props.oidcProvider, {
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

          const albIngressChart = cluster.addHelmChart('AlbIngress', {
            chart: 'aws-alb-ingress-controller',
            release: 'alb-ingress-controller-rt',
            repository: 'https://kubernetes-charts-incubator.storage.googleapis.com',
            version: '2.11.0',
            namespace: 'kube-system',
            values: {
              awsRegion: Stack.of(cluster).region,
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

          new eks.KubernetesManifest(this, 'HorizontalPodAutoscaler', {
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
            const hostedZoneId = route53.HostedZone.fromLookup(this, 'ApiDomainHostedZone', {domainName: props.domainZone}).hostedZoneId;
            const externalDnsRole = new iam.Role(this, 'ExternalDnsRole', {
              assumedBy: new iam.FederatedPrincipal(
                'arn:aws:iam::' + Stack.of(this).account + ':oidc-provider/' + props.oidcProvider, {
                'StringEquals': {
                  [`${OIDC_PROVIDER + ':sub'}`]: 'system:serviceaccount:kube-system:external-dns-rt'
                }
              },
                'sts:AssumeRoleWithWebIdentity'
              ),
              roleName: 'ReinventTriviaExternalDnsRole',
              managedPolicies: [
                new iam.ManagedPolicy(this, 'ExternalDnsPolicy', {
                  managedPolicyName: 'ExternalDnsPolicy',
                  description: 'Used by the ExternalDNS pod to make AWS API calls for updating DNS',
                  statements: [
                    new iam.PolicyStatement({
                      resources: ['arn:aws:route53:::hostedzone/' + hostedZoneId],
                      effect: iam.Effect.ALLOW,
                      actions: [
                        "route53:ChangeResourceRecordSets"
                      ]
                    }),
                    new iam.PolicyStatement({
                      resources: ['*'],
                      effect: iam.Effect.ALLOW,
                      actions: [
                        'route53:ListHostedZones',
                        'route53:ListResourceRecordSets',
                      ]
                    })
                  ]
                })
              ]
            });
            const externalDnsChart = cluster.addHelmChart('ExternalDns', {
              chart: 'external-dns',
              release: 'external-dns-rt',
              repository: 'https://kubernetes-sigs.github.io/external-dns/',
              version: '1.15.2',
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

const app = new App();
new TriviaBackendStack(app, 'TriviaBackendProd', {
  domainName: 'api.reinvent-trivia.com',
  // NOTE: `domainZone` must already exist in Route 53.
  domainZone: 'reinvent-trivia.com',
  env: {account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1'},
  tags: {
      project: "reinvent-trivia"
  },
  /*
   * NOTE: `oidcProvider` will not be available until after the cluster is deployed for the first
   * time. Leave the line below commented out for the initial `cdk deploy`. See README for details.
   */
  //oidcProvider: 'oidc.eks.<region>.amazonaws.com/id/<hexadecimal string>',
});
app.synth();
