import {Construct} from '@aws-cdk/core';
import {Effect, ManagedPolicy, PolicyStatement} from '@aws-cdk/aws-iam';

/**
 * From: https://raw.githubusercontent.com/kubernetes-sigs/aws-alb-ingress-controller/v1.1.4/docs/examples/iam-policy.json
 */
export class AlbIngressControllerPolicy extends ManagedPolicy {
  constructor(parent: Construct, id: string) {
    super(parent, id, {
      managedPolicyName: 'AlbIngressControllerPolicy',
      description: 'Used by the ALB Ingress Controller pod to make AWS API calls',
      statements: [
        new PolicyStatement({
          resources: ['*'], effect: Effect.ALLOW, actions: [
            "acm:DescribeCertificate",
            "acm:ListCertificates",
            "acm:GetCertificate"
          ]
        }),
        new PolicyStatement({
          resources: ['*'], effect: Effect.ALLOW, actions: [
            "ec2:AuthorizeSecurityGroupIngress",
            "ec2:CreateSecurityGroup",
            "ec2:CreateTags",
            "ec2:DeleteTags",
            "ec2:DeleteSecurityGroup",
            "ec2:DescribeAccountAttributes",
            "ec2:DescribeAddresses",
            "ec2:DescribeInstances",
            "ec2:DescribeInstanceStatus",
            "ec2:DescribeInternetGateways",
            "ec2:DescribeNetworkInterfaces",
            "ec2:DescribeSecurityGroups",
            "ec2:DescribeSubnets",
            "ec2:DescribeTags",
            "ec2:DescribeVpcs",
            "ec2:ModifyInstanceAttribute",
            "ec2:ModifyNetworkInterfaceAttribute",
            "ec2:RevokeSecurityGroupIngress"
          ]
        }),
        new PolicyStatement({
          resources: ['*'], effect: Effect.ALLOW, actions: [
            "elasticloadbalancing:AddListenerCertificates",
            "elasticloadbalancing:AddTags",
            "elasticloadbalancing:CreateListener",
            "elasticloadbalancing:CreateLoadBalancer",
            "elasticloadbalancing:CreateRule",
            "elasticloadbalancing:CreateTargetGroup",
            "elasticloadbalancing:DeleteListener",
            "elasticloadbalancing:DeleteLoadBalancer",
            "elasticloadbalancing:DeleteRule",
            "elasticloadbalancing:DeleteTargetGroup",
            "elasticloadbalancing:DeregisterTargets",
            "elasticloadbalancing:DescribeListenerCertificates",
            "elasticloadbalancing:DescribeListeners",
            "elasticloadbalancing:DescribeLoadBalancers",
            "elasticloadbalancing:DescribeLoadBalancerAttributes",
            "elasticloadbalancing:DescribeRules",
            "elasticloadbalancing:DescribeSSLPolicies",
            "elasticloadbalancing:DescribeTags",
            "elasticloadbalancing:DescribeTargetGroups",
            "elasticloadbalancing:DescribeTargetGroupAttributes",
            "elasticloadbalancing:DescribeTargetHealth",
            "elasticloadbalancing:ModifyListener",
            "elasticloadbalancing:ModifyLoadBalancerAttributes",
            "elasticloadbalancing:ModifyRule",
            "elasticloadbalancing:ModifyTargetGroup",
            "elasticloadbalancing:ModifyTargetGroupAttributes",
            "elasticloadbalancing:RegisterTargets",
            "elasticloadbalancing:RemoveListenerCertificates",
            "elasticloadbalancing:RemoveTags",
            "elasticloadbalancing:SetIpAddressType",
            "elasticloadbalancing:SetSecurityGroups",
            "elasticloadbalancing:SetSubnets",
            "elasticloadbalancing:SetWebACL"
          ]
        }),
        new PolicyStatement({
          resources: ['*'], effect: Effect.ALLOW, actions: [
            "iam:CreateServiceLinkedRole",
            "iam:GetServerCertificate",
            "iam:ListServerCertificates"
          ]
        }),
        new PolicyStatement({
          resources: ['*'], effect: Effect.ALLOW, actions: [
            "cognito-idp:DescribeUserPoolClient"
          ]
        }),
        new PolicyStatement({
          resources: ['*'], effect: Effect.ALLOW, actions: [
            "waf-regional:GetWebACLForResource",
            "waf-regional:GetWebACL",
            "waf-regional:AssociateWebACL",
            "waf-regional:DisassociateWebACL"
          ]
        }),
        new PolicyStatement({
          resources: ['*'], effect: Effect.ALLOW, actions: [
            "tag:GetResources",
            "tag:TagResources"
          ]
        }),
        new PolicyStatement({
          resources: ['*'], effect: Effect.ALLOW, actions: [
            "waf:GetWebACL"
          ]
        })
      ]
    })
  }
}
