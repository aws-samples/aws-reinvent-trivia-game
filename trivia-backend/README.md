# Trivia Backend API Service

The trivia backend is a REST API that serves questions and answers.  A running example can be seen on [api.reinvent-trivia.com](https://api.reinvent-trivia.com/api/docs/).

## Prep

Create an ECR repository for both the base Docker image and the application image.

```
aws ecr create-repository --repository-name reinvent-trivia-backend

aws ecr create-repository --repository-name reinvent-trivia-backend-base
```

Create AWS Certificate Manager certificates for the 'api' and 'test-api' subdomains, then put the unique ARN of those certificates in an AWS Systems Manager Parameter Store parameter.

```
aws ssm put-parameter --name CertificateArn-api.reinvent-trivia.com --type String --value arn:aws:acm:...

aws ssm put-parameter --name CertificateArn-test-api.reinvent-trivia.com --type String --value arn:aws:acm:...
```

## Customize

Replace all references to 'reinvent-trivia.com' with your own domain name.

# Docker images

The base image Dockerfile can be found in the base/ directory.  In the backend pipeline modeled in the "pipelines" folder, the base image is built in one "base image" pipeline, which triggers another pipeline for the main application.  In the main application pipeline, the base image URI is replaced in the main Dockerfile with the latest base image that triggered the pipeline.

Locally, it can be built with the following commands.  Follow the "push commands" instructions in the ECR console to push them into the ECR repository.

```
docker build -t reinvent-trivia-backend-base:release base/

docker build -t reinvent-trivia-backend:release .
```

# Infrastructure as code

The cdk folder contains examples of how to model this service with the [AWS Cloud Development Kit (AWS)](https://github.com/awslabs/aws-cdk) and provision the service with AWS CloudFormation.

To deploy the Typescript example, run the following.
```
npm install

npm run build

cdk synth -o build --app 'node ecs-service.js'

cdk deploy --app ecs-service.js TriviaBackendTest

cdk deploy --app ecs-service.js TriviaBackendProd
```

# Blue-green deployments

The blue-green-setup folder contains examples of the configuration needed to setup and execute a blue-green deployment with CodeDeploy: CodeDeploy appspec file, ECS task definition file, ECS service, CodeDeploy application definition, and CodeDeploy deployment group.

The hooks folder contains an example of a pre-traffic hook for use with CodeDeploy deployments.  To deploy the hook (replacing reinvent-trivia.com with your own domain name):

```
cd hooks

npm install

aws cloudformation package --template-file template.yaml --s3-bucket <bucket-name> --output-template-file packaged-template.yaml

aws cloudformation deploy --template-file packaged-template.yaml --stack-name TriviaBackendHooksTest --capabilities CAPABILITY_IAM --parameter-overrides TriviaBackendDomain=api-test.reinvent-trivia.com

aws cloudformation deploy --template-file packaged-template.yaml --stack-name TriviaBackendHooksProd --capabilities CAPABILITY_IAM --parameter-overrides TriviaBackendDomain=api.reinvent-trivia.com
```