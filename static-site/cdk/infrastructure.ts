#!/usr/bin/env node
import { App, Stack, StackProps } from 'aws-cdk-lib';
import { StaticSite } from './static-site';
import { RootDomainSite } from './root-domain-site';

interface TriviaGameInfrastructureStackProps extends StackProps {
    domainName: string;
    siteSubDomain: string;
}

class TriviaGameInfrastructureStack extends Stack {
    constructor(parent: App, name: string, props: TriviaGameInfrastructureStackProps) {
        super(parent, name, props);

        new StaticSite(this, 'StaticSite', {
            domainName: props.domainName,
            siteSubDomain: props.siteSubDomain
        });
   }
}

interface TriviaGameRootDomainStackProps extends StackProps {
    domainName: string;
}

class TriviaGameRootDomainStack extends Stack {
    constructor(parent: App, name: string, props: TriviaGameRootDomainStackProps) {
        super(parent, name, props);

        new RootDomainSite(this, 'StaticSite', {
            domainName: props.domainName,
            originSubDomain: 'www'
        });
   }
}

const app = new App();
new TriviaGameInfrastructureStack(app, 'TriviaGameStaticSiteInfraTest', {
    domainName: 'reinvent-trivia.com',
    siteSubDomain: 'test',
    env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1' },
    tags: {
        project: "reinvent-trivia"
    }
});
new TriviaGameInfrastructureStack(app, 'TriviaGameStaticSiteInfraProd', {
    domainName: 'reinvent-trivia.com',
    siteSubDomain: 'www',
    env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1' },
    tags: {
        project: "reinvent-trivia"
    }
});
new TriviaGameRootDomainStack(app, 'TriviaGameRootDomainRedirectProd', {
    domainName: 'reinvent-trivia.com',
    env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-1' },
    tags: {
        project: "reinvent-trivia"
    }
});
app.synth();
