import { Construct } from 'constructs';
import {
  aws_certificatemanager as acm,
  aws_ecs as ecs,
  aws_eks as eks,
} from 'aws-cdk-lib';

/**
 * Properties for ReinventTriviaResources
 */
export interface ReinventTriviaResourceProps {
  /**
   * Reference to the ACM certificate
   */
  readonly certificate: acm.ICertificate;
  /**
   * The EKS cluster to apply this configuration to.
   */
  readonly cluster: eks.Cluster;

  /**
   * The domain name to use for the API.
   */
  readonly domainName: string;

  /**
   * Reference to the existing container image from ECR.
   */
  readonly image: ecs.EcrImage;
}

export class ReinventTriviaResource extends eks.KubernetesManifest {
  constructor(parent: Construct, id: string, props: ReinventTriviaResourceProps) {
    const manifest = [
      {
        "apiVersion": "v1",
        "kind": "Namespace",
        "metadata": {
          "name": "reinvent-trivia"
        }
      },
      {
        "apiVersion": "extensions/v1beta1",
        "kind": "Deployment",
        "metadata": {
          "name": "api",
          "namespace": "reinvent-trivia"
        },
        "spec": {
          "replicas": 1,
          "template": {
            "metadata": {
              "labels": {
                "app": "api"
              }
            },
            "spec": {
              "containers": [
                {
                  "image": props.image.imageName,
                  "imagePullPolicy": "Always",
                  "name": "api",
                  "resources": {
                    "requests": {
                      "cpu": "375m",
                      "memory": "1536Mi"
                    }
                  },
                  "ports": [
                    {
                      "containerPort": 80
                    }
                  ],
                  "env": [
                    {
                      "name": "KUBE_NODE_NAME",
                      "valueFrom": {
                        "fieldRef": {
                          "fieldPath": "spec.nodeName"
                        }
                      }
                    },
                    {
                      "name": "KUBE_POD_NAME",
                      "valueFrom": {
                        "fieldRef": {
                          "fieldPath": "metadata.name"
                        }
                      }
                    }
                  ]
                }
              ]
            }
          }
        }
      },
      {
        "apiVersion": "v1",
        "kind": "Service",
        "metadata": {
          "name": "api",
          "namespace": "reinvent-trivia",
        },
        "spec": {
          "ports": [
            {
              "port": 80,
              "targetPort": 80,
              "protocol": "TCP"
            }
          ],
          "type": "NodePort",
          "selector": {
            "app": "api"
          }
        }
      },
      {
        "apiVersion": "extensions/v1beta1",
        "kind": "Ingress",
        "metadata": {
          "name": "api",
          "namespace": "reinvent-trivia",
          "annotations": {
            "kubernetes.io/ingress.class": "alb",
            "alb.ingress.kubernetes.io/scheme": "internet-facing",
            "alb.ingress.kubernetes.io/target-type": "ip",
            "alb.ingress.kubernetes.io/certificate-arn": props.certificate.certificateArn,
            "external-dns.alpha.kubernetes.io/hostname": props.domainName,
          },
          "labels": {
            "app": "api"
          }
        },
        "spec": {
          "rules": [
            {
              "http": {
                "paths": [
                  {
                    "path": "/*",
                    "backend": {
                      "serviceName": "api",
                      "servicePort": 80
                    }
                  }
                ]
              }
            }
          ]
        }
      }
    ]

    super(parent, id, {cluster: props.cluster, manifest})
  }
}
