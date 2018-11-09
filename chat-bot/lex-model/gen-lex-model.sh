#!/bin/bash

set -ex

node convert-model -m ../../trivia-backend/data/questions.json

zip lex-model.zip lex-model.json

import_id=$(aws lex-models start-import \
    --region us-west-2 \
    --payload fileb://lex-model.zip \
    --resource-type BOT \
    --merge-strategy OVERWRITE_LATEST \
    --output text \
    --query 'importId')

while state=$(aws lex-models get-import --import-id $import_id --output text --query 'importStatus'); test "$state" = "IN_PROGRESS"; do
  sleep 1; echo -n '.'
done;

aws lex-models get-import --import-id $import_id
