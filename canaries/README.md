# Canaries

The trivia game application can use Amazon CloudWatch Synthetics to continuously load the webpage and APIs, and alarm when the page does not load or does not render correctly.

## Pre-requisite resources

These instructions require an S3 bucket to store the canary source code, marked as `$BUCKET_NAME` below.

Create an SNS topic for notifications about the canary alarms.  An email address or to a [chat bot](https://docs.aws.amazon.com/chatbot/latest/adminguide/setting-up.html) can then be subscribed to the topic to receive notifications about canary alarms.
```
aws sns create-topic --name reinvent-trivia-notifications --region us-east-1
```

## Test endpoint canary

Update the endpoints in canary.js to your test endpoints, then package and upload the canary script:
```
npm install
mkdir -p nodejs/
cp -a node_modules/ nodejs/
cp canary.js nodejs/node_modules/
zip -r trivia-game-canary-test.zip nodejs/
aws s3 cp trivia-game-canary-test.zip s3://$BUCKET_NAME/
```

Deploy the canary resources:
```
aws cloudformation deploy \
  --region us-east-1 \
  --template-file template.yaml \
  --stack-name TriviaGameCanariesTest \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides Stage=test SourceBucket=$BUCKET_NAME \
  --tags project=reinvent-trivia
```

## Prod endpoint canary

Update the endpoints in canary.js to your prod endpoints, then package and upload the canary script:
```
npm install
mkdir -p nodejs/
cp -a node_modules/ nodejs/
cp canary.js nodejs/node_modules/
zip -r trivia-game-canary-prod.zip nodejs/
aws s3 cp trivia-game-canary-prod.zip s3://$BUCKET_NAME/
```

Deploy the canary resources:
```
aws cloudformation deploy \
  --region us-east-1 \
  --template-file template.yaml \
  --stack-name TriviaGameCanariesProd \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides Stage=prod SourceBucket=$BUCKET_NAME \
  --tags project=reinvent-trivia
```
