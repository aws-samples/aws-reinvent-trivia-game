# Trivia static site

The static site calls into the API backend service to retrieve questions and answers, then displays them in the browser.

## Customize

Replace all references to 'reinvent-trivia.com' with your own domain name.

## Static Pages

The app/ directory contains the static pages that need to be bundled and copied to the site's S3 bucket.

## Infrastructure

The cdk/ directory contains the infrastructure as code, including a CloudFront distribution and S3 bucket.  It uses the [AWS Cloud Development Kit (AWS CDK)](https://github.com/awslabs/aws-cdk) to model infrastructure in Typescript, which then generates CloudFormation templates.

## Deploy

See the commands in buildspec.yml for an example of how to bundle and deploy the site infrastructure and page content, or use the pipeline modeled in the "pipelines" folder to deploy the pages for you.

The CDK is used to both provision infrastructure like the S3 bucket and to deploy the site content to the bucket.  To deploy (after bundling the pages in app/), compile using `npm run build` in the cdk/ directory then use the `cdk deploy --app infrastructure.js TriviaGameStaticSiteInfraTest` command.

## Credits

Static site based on [React Trivia](https://github.com/ccoenraets/react-trivia)
