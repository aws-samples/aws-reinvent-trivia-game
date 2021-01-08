# Alarms

Assuming you have set up all the other components for the trivia game already (including chat bot, backend service, static site, and canaries), these instructions set up [Amazon CloudWatch composite alarms](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Create_Composite_Alarm.html) to notify you if any of these components has issues.

## Pre-requisite resources

First, create an SNS topic for notifications about the composite alarms.
```
aws sns create-topic --name reinvent-trivia-notifications --region us-east-1
```

To subscribe an email address to receive notifications about alarms, follow the instructions for subscribing via email to the SNS topic on [this page](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/US_SetupSNS.html#set-up-sns-topic-cli).

To create a chat bot that notifies you about alarms in Slack or Chime, follow the instructions for connecting AWS Chat Bot to the SNS topic on [this page](https://docs.aws.amazon.com/chatbot/latest/adminguide/setting-up.html).

## Create the test endpoint composite alarm

```
aws cloudformation deploy \
  --region us-east-1 \
  --template-file template.yaml \
  --stack-name TriviaGameCompositeAlarmTest \
  --parameter-overrides Stage=Test \
  --tags project=reinvent-trivia
```

## Create the prod endpoint composite alarm

```
aws cloudformation deploy \
  --region us-east-1 \
  --template-file template.yaml \
  --stack-name TriviaGameCompositeAlarmProd \
  --parameter-overrides Stage=Prod \
  --tags project=reinvent-trivia
```
