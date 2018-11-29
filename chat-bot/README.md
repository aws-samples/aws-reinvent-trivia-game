# Trivia chat bot

The chat bot is based on Amazon Lex, with an AWS Lambda function driving the bot conversation to ask questions and check answers.

## Bot function

The bot uses the AWS Serverless Application Model (SAM) to model, package, and deploy the function code to AWS Lambda.  The function queries the backend API service to get questions and to check whether answer responses are correct.  The function uses the Lex session attributes to keep track of which questions have been asked and the user's score.

## Safe deployments

The chat-bot uses canary deployments using AWS CodeDeploy.  When the serverless application is deployed with AWS CloudFormation, a CodeDeploy deployment is automatically triggered.  Both alarms and a pre-traffic validation function will be provisioned with the stack, and CodeDeploy will use those to validate that the deployment will not impact your traffic.  CodeDeploy will shift 10 percent of traffic to the new function code for 5 minutes, then will shift the rest if no alarms have triggered in that time.

## Lex model

The Lex model is built from the questions and answers found in the trivia-backend folder.  Each question is a slot, which the answer as the slot type.  The data file contains "alternative answers", which are used as synonyms for the slot type.  In order to associate the Lex bot with Slack, [follow these instructions](https://docs.aws.amazon.com/lex/latest/dg/slack-bot-association.html).

## Prep

Create a service-linked IAM role for Lex:

```
aws iam create-service-linked-role --aws-service-name lex.amazonaws.com
```

## Customize

Replace all references to 'reinvent-trivia.com' with your own domain name.

## Deploy

Ideally, use the pipelines in the "pipelines" folder to deploy the bot.  Alternatively, you can use the SAM CLI to deploy.  See the buildspec.yml for additional required commands, like installing dependencies.

```bash
sam package \
    --template-file template.yaml \
    --output-template-file packaged.yaml \
    --s3-bucket REPLACE_THIS_WITH_YOUR_S3_BUCKET_NAME

sam deploy \
    --template-file packaged.yaml \
    --stack-name chat-bot \
    --capabilities CAPABILITY_IAM
```

## Local testing with SAM CLI

```
sam local invoke BotFunction --skip-pull-image -e hook/test-events/four.json

echo '{"DeploymentId":"123","LifecycleEventHookExecutionId":"456"}' | sam local invoke PreTrafficHook --skip-pull-image
```
