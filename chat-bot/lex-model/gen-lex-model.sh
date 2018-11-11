#!/bin/bash

set -ex

# Generate the model
lambda_function_name=$(aws cloudformation describe-stack-resource --stack-name reinvent-trivia-chat-bot-prod --logical-resource-id BotFunction --output text --query 'StackResourceDetail.PhysicalResourceId')

lambda_function_arn="arn:aws:lambda:$AWS_DEFAULT_REGION:$AWS_ACCOUNT_ID:function:$lambda_function_name"

node convert-model -m ../../trivia-backend/data/questions.json -f $lambda_function_arn

zip lex-model.zip lex-model.json

# Import the model
import_id=$(aws lex-models start-import \
    --payload fileb://lex-model.zip \
    --resource-type BOT \
    --merge-strategy OVERWRITE_LATEST \
    --output text \
    --query 'importId')

while state=$(aws lex-models get-import --import-id $import_id --output text --query 'importStatus'); test "$state" = "IN_PROGRESS"; do
  sleep 1; echo -n '.'
done;

aws lex-models get-import --import-id $import_id

state=$(aws lex-models get-import --import-id $import_id --output text --query 'importStatus')

test "$state" = "COMPLETE"

# Build the model
aws lex-models put-bot-alias --name Prod --bot-name TriviaGame --bot-version "\$LATEST" || true

checksum=$(aws lex-models get-bot --name TriviaGame --version-or-alias "\$LATEST" --query 'checksum' --output text)

aws lex-models put-bot --name TriviaGame --cli-input-json file://trivia-game-bot.json --checksum $checksum

while state=$(aws lex-models get-bot --name TriviaGame --version-or-alias "\$LATEST" --output text --query 'status'); test "$state" = "BUILDING"; do
  sleep 1; echo -n '.'
done;

aws lex-models get-bot --name TriviaGame --version-or-alias "\$LATEST"

state=$(aws lex-models get-bot --name TriviaGame --version-or-alias "\$LATEST" --output text --query 'status')

test "$state" = "READY"
