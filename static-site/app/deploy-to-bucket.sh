#!/bin/bash

set -ex

if [ ! -z "$WEBSITE_BUCKET" ]; then
    aws s3 sync . s3://$WEBSITE_BUCKET

    DISTRIBUTION=`aws cloudfront list-distributions | jq -r --arg WEBSITE_BUCKET "$WEBSITE_BUCKET" '.DistributionList.Items[] | select(.Aliases.Items[0] == $WEBSITE_BUCKET) | .Id'`

    INVALIDATION=`aws cloudfront create-invalidation --distribution-id $DISTRIBUTION --paths "/*" --output text --query 'Invalidation.Id'`

    aws cloudfront wait invalidation-completed --distribution-id $DISTRIBUTION --id $INVALIDATION
fi
