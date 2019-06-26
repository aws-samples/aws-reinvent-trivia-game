#!/usr/bin/env node
import acm = require('@aws-cdk/aws-certificatemanager');
import cloudfront = require('@aws-cdk/aws-cloudfront');
import route53 = require('@aws-cdk/aws-route53');
import s3 = require('@aws-cdk/aws-s3');
import cdk = require('@aws-cdk/core');
import targets = require('@aws-cdk/aws-route53-targets/lib');

export interface StaticSiteProps {
    domainName: string;
    siteSubDomain: string;
}

export class StaticSite extends cdk.Construct {
    constructor(parent: cdk.Construct, name: string, props: StaticSiteProps) {
        super(parent, name);

        const siteDomain = props.siteSubDomain + '.' + props.domainName;
        const zone = route53.HostedZone.fromLookup(this, 'Zone', { domainName: props.domainName });

        // Content bucket
        const siteBucket = new s3.Bucket(this, 'SiteBucket', {
            bucketName: siteDomain,
            websiteIndexDocument: 'index.html',
            websiteErrorDocument: 'error.html',
            publicReadAccess: true
        });
        new cdk.CfnOutput(this, 'Bucket', { value: siteBucket.bucketName });

        // TLS certificate
        const certificate = new acm.DnsValidatedCertificate(this, 'SiteCertificate', {
            domainName: siteDomain,
            hostedZone: zone
        });
        new cdk.CfnOutput(this, 'Certificate', { value: certificate.certificateArn });

        // CloudFront distribution that provides HTTPS
        const distribution = new cloudfront.CloudFrontWebDistribution(this, 'SiteDistribution', {
            aliasConfiguration: {
                acmCertRef: certificate.certificateArn,
                names: [ siteDomain ],
                sslMethod: cloudfront.SSLMethod.SNI,
                securityPolicy: cloudfront.SecurityPolicyProtocol.TLS_V1_1_2016
            },
            originConfigs: [
                {
                    s3OriginSource: {
                        s3BucketSource: siteBucket
                    },
                    behaviors : [ {isDefaultBehavior: true}],
                }
            ]
        });
        new cdk.CfnOutput(this, 'DistributionId', { value: distribution.distributionId });

        // Route53 alias record for the CloudFront distribution
        new route53.ARecord(this, 'SiteAliasRecord', {
            recordName: siteDomain,
            target: route53.AddressRecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
            zone
        });
        new cdk.CfnOutput(this, 'Site', { value: 'https://' + siteDomain });
    }
}
