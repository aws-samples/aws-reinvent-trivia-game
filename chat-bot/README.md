# Trivia chat bot

The chat bot is based on Amazon Lex V2, with an AWS Lambda function driving the bot conversation to ask questions and check answers.

### Bot function

The bot uses the AWS Serverless Application Model (SAM) to model, package, and deploy the function code to AWS Lambda.  The function queries the backend API service to get questions and to check whether answer responses are correct.  The function uses the Lex session attributes to keep track of which questions have been asked and the user's score.

### Lex model

The Lex V2 bot is deployed in the same CloudFormation stack as the Lambda function. The bot includes the LetsPlay intent with 16 slots (one through sixteen) for the trivia questions.

In order to associate the Lex bot with Slack, [follow these instructions](https://docs.aws.amazon.com/lexv2/latest/dg/deploy-slack.html).

### Safe deployments

The chat-bot uses canary deployments using AWS CodeDeploy.  When the serverless application is deployed with AWS CloudFormation, a CodeDeploy deployment is automatically triggered.  Both alarms and a pre-traffic validation function will be provisioned with the stack, and CodeDeploy will use those to validate that the deployment will not impact your traffic.  CodeDeploy will shift 10 percent of traffic to the new function code for 5 minutes, then will shift the rest if no alarms have triggered in that time.

## Customize

Replace all references to 'reinvent-trivia.com' with your own domain name.

## Deploy

Ideally, use the pipelines in the "[pipelines](../pipelines/)" folder to deploy the bot.  Alternatively, you can use SAM CLI:

```bash
sam build
sam deploy --guided
```

## Local testing with SAM CLI

```bash
sam local invoke BotFunction --skip-pull-image -e hook/test-events/four.json

echo '{"DeploymentId":"123","LifecycleEventHookExecutionId":"456"}' | sam local invoke PreTrafficHook --skip-pull-image
```
