#!/usr/bin/env node
import cdk = require('@aws-cdk/core');
import { StaticSite } from './static-site';
import { RootDomainSite } from './root-domain-site';

interface TriviaGameInfrastructureStackProps extends cdk.StackProps {
    domainName: string;
    siteSubDomain: string;
}

class TriviaGameInfrastructureStack extends cdk.Stack {
    constructor(parent: cdk.App, name: string, props: TriviaGameInfrastructureStackProps) {
        super(parent, name, props);

        new StaticSite(this, 'StaticSite', {
            domainName: props.domainName,
            siteSubDomain: props.siteSubDomain
        });
   }
}

interface TriviaGameRootDomainStackProps extends cdk.StackProps {
    domainName: string;
}

class TriviaGameRootDomainStack extends cdk.Stack {
    constructor(parent: cdk.App, name: string, props: TriviaGameRootDomainStackProps) {
        super(parent, name, props);

        new RootDomainSite(this, 'StaticSite', {
            domainName: props.domainName,
            originSubDomain: 'www'
        });
   }
}

const app = new cdk.App();
new TriviaGameInfrastructureStack(app, 'TriviaGameStaticSiteInfraTest', {
    domainName: 'reinvent-trivia.com',
    siteSubDomain: 'test',
    env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1' }
});
new TriviaGameInfrastructureStack(app, 'TriviaGameStaticSiteInfraProd', {
    domainName: 'reinvent-trivia.com',
    siteSubDomain: 'www',
    env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1' }
});
new TriviaGameRootDomainStack(app, 'TriviaGameRootDomainSiteInfraProd', {
    domainName: 'reinvent-trivia.com',
    env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1' }
});
app.synth();