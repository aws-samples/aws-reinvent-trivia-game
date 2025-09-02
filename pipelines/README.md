# Continuous delivery pipelines

This package uses the [AWS Cloud Development Kit (AWS)](https://github.com/awslabs/aws-cdk) to model AWS CodePipeline pipelines and to provision them with AWS CloudFormation.

In [src](src/) directory:
* pipeline.ts: Generic pipeline class that defines an infrastructure-as-code pipeline
* api-base-image-pipeline.ts: Builds and publishes the base Docker image for the backend API service
* api-service-pipeline.ts: Builds and deploys the backend API service to Fargate using CodePipeline's [CloudFormation deploy actions](https://docs.aws.amazon.com/codepipeline/latest/userguide/integrations-action-type.html#integrations-deploy-CloudFormation)
* api-service-blue-green-pipeline.ts: Builds and deploys the backend API service to Fargate using CodePipeline's [CloudFormation deploy actions](https://docs.aws.amazon.com/codepipeline/latest/userguide/integrations-action-type.html#integrations-deploy-CloudFormation) and ECS blue-green deployments
* static-site-pipeline.ts: Provisions infrastructure for the static site, like a CloudFront distribution and an S3 bucket, plus bundles and uploads the static site pages to the site's S3 bucket
* chat-bot-pipeline.ts: Builds and deploys the chat bot Lambda function and Lex model
* canaries-pipeline.ts: Builds and deploys the monitoring canaries
* pipelines-bootstrap.ts: Creates resources used by all the pipelines, like a CodeStar Connections connection.

## Prep

Create an SNS topic for notifications about pipeline execution failures.  An email address or a [chat bot](https://docs.aws.amazon.com/chatbot/latest/adminguide/setting-up.html) can be subscribed to the topic to receive notifications about pipeline failures.
```
aws sns create-topic --name reinvent-trivia-notifications --tags Key=project,Value=reinvent-trivia --region us-east-1
```

Follow the [CodeStar Notifications user guide](https://docs.aws.amazon.com/codestar-notifications/latest/userguide/set-up-sns.html) to configure the SNS topic to be able to receive notifications about pipeline failures.

## Customize

Replace all references to 'aws-samples' with your own fork of this repo.  Replace all references to 'reinvent-trivia.com' with your own domain name.

## Deploy

Install the AWS CDK CLI: `npm i -g aws-cdk`

Install and build everything: `npm install && npm run build`

Deploy common resources used by all the pipelines:

```
cdk deploy --app 'node src/pipelines-bootstrap.js'
```

Activate the CodeStar Connections connection created by the previous step.  Go to the [CodeStar Connections console](https://console.aws.amazon.com/codesuite/settings/connections?region=us-east-1), select the `reinvent-trivia-repo` connection, and click "Update pending connection".  Then follow the prompts to connect your GitHub account and repos to AWS.  When finished, the `reinvent-trivia-repo` connection should have the "Available" status.

Then, deploy the individual pipeline stacks:

```
cdk deploy --app 'node src/static-site-pipeline.js'

cdk deploy --app 'node src/api-base-image-pipeline.js'

cdk deploy --app 'node src/api-service-pipeline.js'
OR
cdk deploy --app 'node src/api-service-blue-green-pipeline.js'

cdk deploy --app 'node src/chat-bot-pipeline.js'

cdk deploy --app 'node src/canaries-pipeline.js'
```

See the pipelines in the CodePipeline console.
