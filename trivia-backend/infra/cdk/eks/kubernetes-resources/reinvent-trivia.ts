import {Construct} from '@aws-cdk/core';
import {Cluster, KubernetesResource} from '@aws-cdk/aws-eks';
import {EcrImage} from '@aws-cdk/aws-ecs';
/**
 * Properties for ReinventTriviaResources
 */
export interface ReinventTriviaResourceProps {
  /**
   * The EKS cluster to apply this configuration to.
   */
  readonly cluster: Cluster;

  /**
   * The domain name to use for the API.
   */
  readonly domainName: string;

  /**
   * Reference to the existing container image from ECR.
   */
  readonly image: EcrImage;
}

export class ReinventTriviaResource extends KubernetesResource {
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
      }
    ]

    super(parent, id, {cluster: props.cluster, manifest})
  }
}
