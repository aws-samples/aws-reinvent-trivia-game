#!/usr/bin/env node
import { Construct } from 'constructs';
import { CfnOutput } from 'aws-cdk-lib';
import {
    aws_certificatemanager as acm,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
    aws_route53 as route53,
    aws_route53_targets as targets,
    aws_s3 as s3,
    aws_s3_deployment as s3deploy,
} from 'aws-cdk-lib';

export interface StaticSiteProps {
    domainName: string;
    siteSubDomain: string;
}

export class StaticSite extends Construct {
    constructor(parent: Construct, name: string, props: StaticSiteProps) {
        super(parent, name);

        const siteDomain = props.siteSubDomain + '.' + props.domainName;
        new CfnOutput(this, 'Site', { value: 'https://' + siteDomain });
        const zone = route53.HostedZone.fromLookup(this, 'Zone', { domainName: props.domainName });

        // Content bucket
        const siteBucket = new s3.Bucket(this, 'SiteBucket', {
            bucketName: siteDomain
        });
        new CfnOutput(this, 'Bucket', { value: siteBucket.bucketName });

        // TLS certificate
        const certificate = new acm.Certificate(this, 'SiteCertificate', {
            domainName: siteDomain,
            validation: acm.CertificateValidation.fromDns(zone),
        });
        new CfnOutput(this, 'Certificate', { value: certificate.certificateArn });

        // CloudFront distribution that provides HTTPS
        const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
            defaultBehavior: {
                origin: new origins.S3Origin(siteBucket),
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            },
            defaultRootObject: 'index.html',
            domainNames: [ siteDomain ],
            certificate,
            errorResponses: [
                {
                    httpStatus: 404,
                    responseHttpStatus: 404,
                    responsePagePath: '/error.html'
                },
                {
                    httpStatus: 403,
                    responseHttpStatus: 404,
                    responsePagePath: '/error.html'
                }
            ]
        });

        // Override the distribution logical ID since this was previously a CloudFrontWebDistribution object
        // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cloudfront-readme.html#migrating-from-the-original-cloudfrontwebdistribution-to-the-newer-distribution-construct
        const cfnDistribution = distribution.node.defaultChild as cloudfront.CfnDistribution;
        cfnDistribution.overrideLogicalId('StaticSiteSiteDistributionCFDistribution500D676B');

        new CfnOutput(this, 'DistributionId', { value: distribution.distributionId });

        // Route53 alias record for the CloudFront distribution
        new route53.ARecord(this, 'SiteAliasRecord', {
            recordName: siteDomain,
            target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
            zone
        });

        // Deploy site contents to S3 bucket
        new s3deploy.BucketDeployment(this, 'DeployWithInvalidation', {
            sources: [ s3deploy.Source.asset('../app/build') ],
            destinationBucket: siteBucket,
            distribution,
            distributionPaths: ['/*'],
          });
    }
}
