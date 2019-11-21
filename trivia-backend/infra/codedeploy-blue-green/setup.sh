#!/bin/bash

set -ex

# Provision infrastructure

npm install

npm run deploy-test-infra

npm run deploy-prod-infra

# Provision deployment hooks

cd hooks/

npm install

aws cloudformation package --template-file template.yaml --s3-bucket $1 --output-template-file packaged-template.yaml

aws cloudformation deploy --region us-east-1 --template-file packaged-template.yaml --stack-name TriviaBackendHooksTest --capabilities CAPABILITY_IAM --parameter-overrides TriviaBackendDomain=api-test.reinvent-trivia.com

aws cloudformation deploy --region us-east-1 --template-file packaged-template.yaml --stack-name TriviaBackendHooksProd --capabilities CAPABILITY_IAM --parameter-overrides TriviaBackendDomain=api.reinvent-trivia.com

cd ..

# Generate config files

mkdir -p build

export AWS_REGION=us-east-1

node produce-config.js -g test -s TriviaBackendTest -h TriviaBackendHooksTest

node produce-config.js -g onebox -s TriviaBackendProd -h TriviaBackendHooksProd

node produce-config.js -g prod -s TriviaBackendProd -h TriviaBackendHooksProd

# Create ECS resources

ACCOUNT_ID=`aws sts get-caller-identity --query Account --output text --region us-east-1`

sed -i'.bak' "s|<PLACEHOLDER>|$ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/reinvent-trivia-backend:latest|g" build/task-definition-test.json build/task-definition-onebox.json build/task-definition-prod.json

aws ecs create-cluster --region us-east-1 --cluster-name default

aws ecs register-task-definition --region us-east-1 --cli-input-json file://build/task-definition-test.json

aws ecs create-service --region us-east-1 --service-name trivia-backend-test --cli-input-json file://build/service-definition-test.json || \
  aws ecs create-service --region us-east-1 --service-name trivia-backend-test --cli-input-json file://build/service-definition-test-alt.json || \
  true

aws ecs register-task-definition --region us-east-1 --cli-input-json file://build/task-definition-onebox.json

aws ecs create-service --region us-east-1 --service-name trivia-backend-onebox --desired-count 1 --cli-input-json file://build/service-definition-onebox.json || \
  aws ecs create-service --region us-east-1 --service-name trivia-backend-onebox --desired-count 1 --cli-input-json file://build/service-definition-onebox-alt.json || \
  true

aws ecs register-task-definition --region us-east-1 --cli-input-json file://build/task-definition-prod.json

aws ecs create-service --region us-east-1 --service-name trivia-backend-prod --cli-input-json file://build/service-definition-prod.json || \
  aws ecs create-service --region us-east-1 --service-name trivia-backend-prod --cli-input-json file://build/service-definition-prod-alt.json || \
  true

# Create CodeDeploy resources

set +e

aws deploy create-application --region us-east-1 --application-name AppECS-default-trivia-backend-test --compute-platform ECS

aws deploy create-application --region us-east-1 --application-name AppECS-default-trivia-backend-onebox --compute-platform ECS

aws deploy create-application --region us-east-1 --application-name AppECS-default-trivia-backend-prod --compute-platform ECS

aws deploy create-deployment-group --region us-east-1 --deployment-group-name DgpECS-default-trivia-backend-test --cli-input-json file://build/deployment-group-test.json

aws deploy create-deployment-group --region us-east-1 --deployment-group-name DgpECS-default-trivia-backend-onebox --cli-input-json file://build/deployment-group-onebox.json

aws deploy create-deployment-group --region us-east-1 --deployment-group-name DgpECS-default-trivia-backend-prod --cli-input-json file://build/deployment-group-prod.json

set -e

# Start deployment

aws ecs deploy --region us-east-1 --service trivia-backend-test --task-definition build/task-definition-test.json --codedeploy-appspec build/appspec-test.json

aws ecs deploy --region us-east-1 --service trivia-backend-onebox --task-definition build/task-definition-onebox.json --codedeploy-appspec build/appspec-onebox.json

aws ecs deploy --region us-east-1 --service trivia-backend-prod --task-definition build/task-definition-prod.json --codedeploy-appspec build/appspec-prod.json
