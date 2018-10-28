#!/usr/bin/env node
import acm = require('@aws-cdk/aws-certificatemanager');
import cloudfront = require('@aws-cdk/aws-cloudfront');
import route53 = require('@aws-cdk/aws-route53');
import s3 = require('@aws-cdk/aws-s3');
import cdk = require('@aws-cdk/cdk');

export interface StaticSiteProps {
    domainName: string;
    siteSubDomain: string;
}

export class StaticSite extends cdk.Construct {
    public readonly domainName: string;
    public readonly siteSubDomain: string;

    constructor(parent: cdk.Construct, name: string, props: StaticSiteProps) {
        super(parent, name);

        this.domainName = props.domainName;
        this.siteSubDomain = props.siteSubDomain;
        const siteDomain = this.siteSubDomain + '.' + this.domainName;

        // Content bucket
        const siteBucket = new s3.Bucket(this, 'SiteBucket', {
            bucketName: siteDomain,
            websiteIndexDocument: 'index.html',
            websiteErrorDocument: 'error.html',
            publicReadAccess: true
        });
        siteBucket.export();

        const certificate = new acm.cloudformation.CertificateResource(this, 'SiteCertificate', {
            domainName: siteDomain,
            validationMethod: 'DNS'
        });

        const distribution = new cloudfront.CloudFrontWebDistribution(this, 'SiteDistribution', {
            aliasConfiguration: {
                acmCertRef: certificate.certificateArn,
                names: [ siteDomain ],
                sslMethod: cloudfront.SSLMethod.SNI,
                securityPolicy: cloudfront.SecurityPolicyProtocol.TLSv1
            },

            originConfigs: [
                {
                    s3OriginSource: {
                        s3BucketSource: siteBucket
                    },
                    behaviors : [ {isDefaultBehavior: true}]
                }
            ]
        });

        new route53.cloudformation.RecordSetResource(this, 'SiteAliasRecord', {
            hostedZoneName: this.domainName,
            name: this.siteSubDomain,
            type: 'A',
            aliasTarget: {
                dnsName: distribution.domainName,
                hostedZoneId: distribution.aliasHostedZoneId
            }
        });
    }
}
