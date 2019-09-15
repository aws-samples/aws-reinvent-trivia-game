# Generate files

```
mkdir build

export AWS_REGION=us-east-1

node produce-config.js -g test -s TriviaBackendTest -h TriviaBackendHooksTest

node produce-config.js -g prod -s TriviaBackendProd -h TriviaBackendHooksProd
```

# Create ECS resources

```
aws ecs register-task-definition --cli-input-json file://task-definition.json

aws ecs create-service --service-name trivia-backend-test --cli-input-json file://build/service-definition-test.json

aws ecs create-service --service-name trivia-backend-prod --cli-input-json file://build/service-definition-prod.json
```

# Create CodeDeploy resources

```
aws deploy create-application --application-name AppECS-default-trivia-backend-test --compute-platform ECS

aws deploy create-application --application-name AppECS-default-trivia-backend-prod --compute-platform ECS

aws deploy create-deployment-group --deployment-group-name DgpECS-default-trivia-backend-test --cli-input-json file://build/deployment-group-test.json

aws deploy create-deployment-group --deployment-group-name DgpECS-default-trivia-backend-prod --cli-input-json file://build/deployment-group-prod.json
```

# Start deployment

```
aws ecs deploy --service trivia-backend-test --task-definition task-definition.json --codedeploy-appspec build/appspec-test.json

aws ecs deploy --service trivia-backend-prod --task-definition task-definition.json --codedeploy-appspec build/appspec-prod.json
```

OR:

```
aws deploy create-deployment --application-name trivia-backend-blue-green --deployment-group-name trivia-backend-test --revision revisionType=AppSpecContent,appSpecContent={content="'`cat build/appspec-test.json`'"}

aws deploy create-deployment --application-name trivia-backend-blue-green --deployment-group-name trivia-backend-prod --revision revisionType=AppSpecContent,appSpecContent={content="'`cat build/appspec-prod.json`'"}

aws deploy wait deployment-successful --deployment-id d-UJBN2IPSW

aws deploy get-deployment --deployment-id d-TZF9XEASW

aws deploy get-deployment-target --deployment-id d-TZF9XEASW --target-id ecs-demo:ecs-demo
```
