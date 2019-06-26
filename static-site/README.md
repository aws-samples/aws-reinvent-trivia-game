# Trivia static site

The static site calls into the API backend service to retrieve questions and answers, then displays them in the browser.

## Customize

Replace all references to 'reinvent-trivia.com' with your own domain name.

## Infrastructure

The cdk/ directory contains the infrastructure as code, including a CloudFront distribution and S3 bucket.  It uses the [AWS Cloud Development Kit (AWS)](https://github.com/awslabs/aws-cdk) to model infrastructure in Typescript, which then generates CloudFormation templates.  To deploy, compile using `npm run build` then use the `cdk deploy --app infrastructure.js TriviaGameStaticSiteInfraTest` command, or use the pipelines modeled in the "pipelines" folder to deploy the infrastructure for you.

## Static Pages

The app/ directory contains the static pages that need to be bundled and copied to the site's S3 bucket.  See the commands in app/buildspec.yml for an example of how to bundle the pages, or use the pipelines modeled in the "pipelines" folder to deploy the pages for you.

## Credits

Static site based on [React Trivia](https://github.com/ccoenraets/react-trivia)
