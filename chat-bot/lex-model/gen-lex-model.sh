#!/bin/bash

set -ex

lambda_function_name=$(aws cloudformation describe-stack-resource --stack-name reinvent-trivia-chat-bot-prod --logical-resource-id BotFunction --output text --query 'StackResourceDetail.PhysicalResourceId')

lambda_function_arn="arn:aws:lambda:$AWS_DEFAULT_REGION:$AWS_ACCOUNT_ID:function:$lambda_function_name"

node convert-model -m ../../trivia-backend/data/questions.json -f $lambda_function_arn

zip lex-model.zip lex-model.json

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
