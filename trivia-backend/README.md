# Trivia Backend API Service

The trivia backend is a REST API that serves questions and answers.  A running example can be seen on [api.reinvent-trivia.com](https://api.reinvent-trivia.com/api/docs/).

## Prep

Create an ECR repository for both the base Docker image and the application image.

```
aws ecr create-repository --region us-east-1 --repository-name reinvent-trivia-backend

aws ecr create-repository --region us-east-1 --repository-name reinvent-trivia-backend-base
```

Create AWS Certificate Manager certificates for the 'api' and 'test-api' subdomains, then put the unique ARN of those certificates in an AWS Systems Manager Parameter Store parameter.

```
aws ssm put-parameter --region us-east-1 --name CertificateArn-api.reinvent-trivia.com --type String --value arn:aws:acm:...

aws ssm put-parameter --region us-east-1 --name CertificateArn-test-api.reinvent-trivia.com --type String --value arn:aws:acm:...
```

## Customize

Replace all references to 'reinvent-trivia.com' with your own domain name.

# Docker images

The base image Dockerfile can be found in the base/ directory.  In the backend pipeline modeled in the "pipelines" folder, the base image is built in one "base image" pipeline, which triggers another pipeline for the main application.  In the main application pipeline, the base image URI is replaced in the main Dockerfile with the latest base image that triggered the pipeline.

Locally, it can be built with the following commands.  Follow the "push commands" instructions in the ECR console to push them into the ECR repository.

```
docker build -t reinvent-trivia-backend-base:release base/

docker build -t reinvent-trivia-backend:latest .
```

# Provision

There are two options in the infra directory for provisioning and deploying the backend services.

## Infrastructure as code

The cdk folder contains examples of how to model this service with the [AWS Cloud Development Kit (AWS)](https://github.com/awslabs/aws-cdk) and provision the service with AWS CloudFormation.  See the pipelines folder for instructions on how to continously deploy this example.

To deploy the Typescript example, run the following.
```
npm install -g aws-cdk

npm install

npm run build

cdk synth -o build --app 'node ecs-service.js'

cdk deploy --app ecs-service.js TriviaBackendTest

cdk deploy --app ecs-service.js TriviaBackendProd
```

# CodeDeploy blue-green deployments

The codedeploy-blue-green folder contains examples of the configuration needed to setup and execute a blue-green deployment with CodeDeploy: CodeDeploy appspec file, ECS task definition file, ECS service, CodeDeploy application definition, and CodeDeploy deployment group.

The non-service infrastructure (load balancer, security groups, roles, etc) is modeled and provisioned with the AWS CDK.  A sample pre-traffic CodeDeploy hook is modeled and provisioned with CloudFormation.

To deploy this example, run the following in infra/codedeploy-blue-green.
```
npm install -g aws-cdk

./setup.sh <S3 bucket for storing temporary artifacts>
```

See the pipelines folder for instructions on how to continuously deploy this example.
