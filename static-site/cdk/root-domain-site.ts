#!/usr/bin/env node

import { Construct } from 'constructs';
import { CfnOutput } from 'aws-cdk-lib';
import {
    aws_certificatemanager as acm,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
    aws_route53 as route53,
    aws_route53_targets as targets,
} from 'aws-cdk-lib';

export interface RootDomainSiteProps {
    domainName: string;
    originSubDomain: string;
}

export class RootDomainSite extends Construct {
    constructor(parent: Construct, name: string, props: RootDomainSiteProps) {
        super(parent, name);

        const originDomain = props.originSubDomain + '.' + props.domainName;
        const zone = route53.HostedZone.fromLookup(this, 'Zone', { domainName: props.domainName });

        // TLS certificate
        const certificate = new acm.Certificate(this, 'SiteCertificate', {
            domainName: props.domainName,
            validation: acm.CertificateValidation.fromDns(zone),
        });
        new CfnOutput(this, 'Certificate', { value: certificate.certificateArn });

        // CloudFront distribution that provides HTTPS
        const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
            defaultBehavior: {
                origin: new origins.HttpOrigin(originDomain),
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            },
            domainNames: [ props.domainName ],
            certificate,    
        });

        // Override the distribution logical ID since this was previously a CloudFrontWebDistribution object
        // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cloudfront-readme.html#migrating-from-the-original-cloudfrontwebdistribution-to-the-newer-distribution-construct
        const cfnDistribution = distribution.node.defaultChild as cloudfront.CfnDistribution;
        cfnDistribution.overrideLogicalId('StaticSiteSiteDistributionCFDistribution500D676B');

        new CfnOutput(this, 'DistributionId', { value: distribution.distributionId });

        // Route53 alias record for the CloudFront distribution
        new route53.ARecord(this, 'SiteAliasRecord', {
            recordName: props.domainName,
            target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
            zone
        });
    }
}
