# Generate files

export AWS_REGION=us-east-1

node produce-config.js -g test -s TriviaBackendTest

node produce-config.js -g prod -s TriviaBackendProd

# Create ECS resources

aws ecs register-task-definition --cli-input-json file://task-definition.json

aws ecs create-service --service-name trivia-backend-blue-green-test --cli-input-json file://build/service-definition-test.json

aws ecs create-service --service-name trivia-backend-blue-green-prod --cli-input-json file://build/service-definition-prod.json

# Create CodeDeploy resources

aws deploy create-application --application-name trivia-backend-blue-green --compute-platform ECS

aws deploy create-deployment-group --deployment-group-name trivia-backend-test --cli-input-json file://build/deployment-group-test.json

aws deploy create-deployment-group --deployment-group-name trivia-backend-prod --cli-input-json file://build/deployment-group-prod.json

# Start deployment

aws deploy create-deployment --application-name trivia-backend-blue-green --deployment-group-name trivia-backend-test --revision revisionType=AppSpecContent,appSpecContent={content="'`cat build/appspec-test.json`'"}

aws deploy create-deployment --application-name trivia-backend-blue-green --deployment-group-name trivia-backend-prod --revision revisionType=AppSpecContent,appSpecContent={content="'`cat build/appspec-prod.json`'"}

aws deploy wait deployment-successful --deployment-id d-UJBN2IPSW

aws deploy get-deployment --deployment-id d-TZF9XEASW

aws deploy get-deployment-target --deployment-id d-TZF9XEASW --target-id ecs-demo:ecs-demo