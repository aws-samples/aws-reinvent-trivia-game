# Provision infrastructure

```
npm install -g aws-cdk

npm install

npm run deploy-test-infra

npm run deploy-prod-infra
```

# Provision deployment hooks

```
cd hooks

npm install

aws cloudformation package --template-file template.yaml --s3-bucket <bucket-name> --output-template-file packaged-template.yaml

aws cloudformation deploy --region us-east-1 --template-file packaged-template.yaml --stack-name TriviaBackendHooksTest --capabilities CAPABILITY_IAM --parameter-overrides TriviaBackendDomain=api-test.reinvent-trivia.com

aws cloudformation deploy --region us-east-1 --template-file packaged-template.yaml --stack-name TriviaBackendHooksProd --capabilities CAPABILITY_IAM --parameter-overrides TriviaBackendDomain=api.reinvent-trivia.com

cd ..
```

# Generate config files

```
mkdir build

export AWS_REGION=us-east-1

node produce-config.js -g test -s TriviaBackendTest -h TriviaBackendHooksTest

node produce-config.js -g prod -s TriviaBackendProd -h TriviaBackendHooksProd
```

# Create ECS resources

In build/task-definition-test.json and build/test-definition-prod.json, replace the image "<PLACEHOLDER>" with your image in ECR.  For example, `123456789012.dkr.ecr.us-east-1.amazonaws.com/reinvent-trivia-backend:release`.

```
aws ecs register-task-definition --region us-east-1 --cli-input-json file://build/task-definition-test.json

aws ecs create-service --region us-east-1 --service-name trivia-backend-test --cli-input-json file://build/service-definition-test.json

aws ecs register-task-definition --region us-east-1 --cli-input-json file://build/task-definition-prod.json

aws ecs create-service --region us-east-1 --service-name trivia-backend-prod --cli-input-json file://build/service-definition-prod.json
```

# Create CodeDeploy resources

```
aws deploy create-application --region us-east-1 --application-name AppECS-default-trivia-backend-test --compute-platform ECS

aws deploy create-application --region us-east-1 --application-name AppECS-default-trivia-backend-prod --compute-platform ECS

aws deploy create-deployment-group --region us-east-1 --deployment-group-name DgpECS-default-trivia-backend-test --cli-input-json file://build/deployment-group-test.json

aws deploy create-deployment-group --region us-east-1 --deployment-group-name DgpECS-default-trivia-backend-prod --cli-input-json file://build/deployment-group-prod.json
```

# Start deployment

```
aws ecs deploy --region us-east-1 --service trivia-backend-test --task-definition build/task-definition-test.json --codedeploy-appspec build/appspec-test.json

aws ecs deploy --region us-east-1 --service trivia-backend-prod --task-definition build/task-definition-prod.json --codedeploy-appspec build/appspec-prod.json
```
