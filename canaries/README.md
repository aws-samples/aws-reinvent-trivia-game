# Canaries

The trivia game application can use Amazon CloudWatch Synthetics (currently in Preview) to continuously load the webpage and APIs, and alarm when the page does not load or does not render correctly.

## Test endpoint canary

Deploy the prerequisite resources:
```
aws cloudformation deploy \
  --region us-east-1 \
  --template-file template.yaml \
  --stack-name TriviaGameCanariesTest \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides Stage=test
```

Get the bucket name:
```
aws cloudformation describe-stack-resources --stack-name TriviaGameCanariesTest --region us-east-1
```

Update the endpoints in canary.js to your test endpoints, then package and upload the canary script:
```
npm install
mkdir -p nodejs/
cp -a node_modules/ nodejs/
cp canary.js nodejs/node_modules/
zip -r canary-test.zip nodejs/
aws s3 cp canary-test.zip s3://$BUCKET_NAME/
```

Create the canary: https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#synthetics:canary/create
```
Name: trivia-game-test
Source Location: s3://$BUCKET_NAME/canary-test.zip
Entrypoint: canary.handler
Data Storage: s3://$BUCKET_NAME
Thresholds: Enabled
Role: CloudWatchSyntheticsRole-trivia-game-test
```

## Prod endpoint canary

Deploy the prerequisite resources:
```
aws cloudformation deploy \
  --region us-east-1 \
  --template-file template.yaml \
  --stack-name TriviaGameCanariesProd \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides Stage=prod
```

Get the bucket name:
```
aws cloudformation describe-stack-resources --stack-name TriviaGameCanariesProd --region us-east-1
```

Update the endpoints in canary.js to your prod endpoints, then package and upload the canary script:
```
npm install
mkdir -p nodejs/
cp -a node_modules/ nodejs/
cp canary.js nodejs/node_modules/
zip -r canary-prod.zip nodejs/
aws s3 cp canary-prod.zip s3://$BUCKET_NAME/
```

Create the canary: https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#synthetics:canary/create
```
Name: trivia-game-prod
Source Location: s3://$BUCKET_NAME/canary-prod.zip
Entrypoint: canary.handler
Data Storage: s3://$BUCKET_NAME
Thresholds: Enabled
Role: CloudWatchSyntheticsRole-trivia-game-prod
```

## Notifications

Create an SNS topic for notifications about the canary alarms.  An email address or to a [chat bot](https://docs.aws.amazon.com/chatbot/latest/adminguide/setting-up.html) can then be subscribed to the topic to receive notifications about canary alarms.
```
aws sns create-topic --name reinvent-trivia-notifications --region us-east-1
```

Update `Synthetics-Alarm-trivia-game-prod` and `Synthetics-Alarm-trivia-game-test` to add the topic ARN to the alarm's "In alarm" notifications.