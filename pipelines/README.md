# Continuous delivery pipelines

This package uses the [AWS Cloud Development Kit (AWS)](https://github.com/awslabs/aws-cdk) to model AWS CodePipeline pipelines and to provision them with AWS CloudFormation.

In src/ directory:
* pipeline.ts: Generic pipeline class that defines an infrastructure-as-code pipeline
* api-base-image-pipeline.ts: Builds and publishes the base Docker image for the backend API service
* api-service-pipeline.ts: Builds and deploys the backend API service to Fargate
* static-site-infra-pipeline.ts: Provisions infrastructure for the static site, like a CloudFront distribution and an S3 bucket
* static-site-pipeline.ts: Bundles and uploads the static site pages to the site's S3 bucket
* chat-bot-pipeline.ts: Builds and deploys the chat bot Lambda function and Lex model

## Prep

Create a GitHub [personal access token](https://github.com/settings/tokens) with access to your fork of the repo, including "admin:repo_hook" and "repo" permissions.  Then store the token in Parameter Store:

```
aws ssm put-parameter --name GitHubToken --type String --value 12345
```

## Customize

Replace all references to 'aws-samples' with your own fork of this repo.  Replace all references to 'reinvent-trivia.com' with your own domain name.

## Deploy

Install the AWS CDK CLI: `npm i -g aws-cdk`

Install and build everything: `npm install && npm run build`

Then deploy the stacks:

```
cdk deploy --app 'node src/static-site-infra-pipeline.js'

cdk deploy --app 'node src/static-site-pipeline.js'

cdk deploy --app 'node src/api-base-image-pipeline.js'

cdk deploy --app 'node src/api-service-pipeline.js'

cdk deploy --app 'node src/chat-bot-pipeline.js'
```

See the pipelines in the CodePipeline console.
