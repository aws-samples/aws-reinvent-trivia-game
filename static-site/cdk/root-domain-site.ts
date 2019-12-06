#!/usr/bin/env node
import acm = require('@aws-cdk/aws-certificatemanager');
import cloudfront = require('@aws-cdk/aws-cloudfront');
import route53 = require('@aws-cdk/aws-route53');
import cdk = require('@aws-cdk/core');
import targets = require('@aws-cdk/aws-route53-targets/lib');

export interface RootDomainSiteProps {
    domainName: string;
    originSubDomain: string;
}

export class RootDomainSite extends cdk.Construct {
    constructor(parent: cdk.Construct, name: string, props: RootDomainSiteProps) {
        super(parent, name);

        const originDomain = props.originSubDomain + '.' + props.domainName;
        const zone = route53.HostedZone.fromLookup(this, 'Zone', { domainName: props.domainName });

        // TLS certificate
        const certificateArn = new acm.DnsValidatedCertificate(this, 'SiteCertificate', {
            domainName: props.domainName,
            hostedZone: zone
        }).certificateArn;
        new cdk.CfnOutput(this, 'Certificate', { value: certificateArn });

        // CloudFront distribution that provides HTTPS
        const distribution = new cloudfront.CloudFrontWebDistribution(this, 'SiteDistribution', {
            aliasConfiguration: {
                acmCertRef: certificateArn,
                names: [ props.domainName ],
                sslMethod: cloudfront.SSLMethod.SNI,
                securityPolicy: cloudfront.SecurityPolicyProtocol.TLS_V1_1_2016
            },
            originConfigs: [
                {
                    customOriginSource: {
                        domainName: originDomain
                    },
                    behaviors : [ {isDefaultBehavior: true}],
                }
            ]
        });
        new cdk.CfnOutput(this, 'DistributionId', { value: distribution.distributionId });

        // Route53 alias record for the CloudFront distribution
        new route53.ARecord(this, 'SiteAliasRecord', {
            recordName: props.domainName,
            target: route53.AddressRecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
            zone
        });
    }
}
