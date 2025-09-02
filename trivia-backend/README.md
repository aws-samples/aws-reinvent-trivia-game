# Trivia Backend API Service

The trivia backend is a REST API that serves questions and answers.  A running example can be seen on [api.reinvent-trivia.com](https://api.reinvent-trivia.com/api/docs/).

## Prep

Create an ECR repository for both the base Docker image and the application image.

```
aws ecr create-repository --region us-east-1 --tags Key=project,Value=reinvent-trivia --repository-name reinvent-trivia-backend

aws ecr create-repository --region us-east-1 --tags Key=project,Value=reinvent-trivia --repository-name reinvent-trivia-backend-base
```

Create AWS Certificate Manager certificates for the 'api' and 'test-api' subdomains, then put the unique ARN of those certificates in an AWS Systems Manager Parameter Store parameter.

```
aws ssm put-parameter --region us-east-1 --tags Key=project,Value=reinvent-trivia --name CertificateArn-api.reinvent-trivia.com --type String --value arn:aws:acm:...

aws ssm put-parameter --region us-east-1 --tags Key=project,Value=reinvent-trivia --name CertificateArn-test-api.reinvent-trivia.com --type String --value arn:aws:acm:...
```

## Customize

Replace all references to 'reinvent-trivia.com' with your own domain name. This sample assumes that you already registered your domain name and created a [Route53 hosted zone](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/AboutHZWorkingWith.html) for the domain name in your AWS account.

## Build Docker images

The base image Dockerfile can be found in the [base](base/) folder.  In the example pipelines modeled in the "[pipelines](../pipelines/)" folder, the base image is built in one "base image" pipeline, which triggers another pipeline for the main application.  In the main application pipeline, the base image URI is replaced in the main Dockerfile with the latest base image that triggered the pipeline.

Locally, it can be built with the following commands.  Follow the "push commands" instructions in the ECR console to push them into the ECR repository.

```
docker build -t reinvent-trivia-backend-base:release base/

docker build -t reinvent-trivia-backend:latest .
```

## Provision using infrastructure as code

There are multiple options in the [cdk](cdk/) folder for provisioning and deploying the backend services.  See instructions below for how to set up each of these options.
1. ECS on Fargate, deployed via CloudFormation using [ECS rolling update deployments](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-type-ecs.html). ([jump to instructions](#ecs-on-fargate-rolling-update-deployments))
1. ECS on Fargate, deployed via CloudFormation using [ECS blue-green deployments](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-type-blue-green.html). ([jump to instructions](#ecs-on-fargate-blue-green-deployments))
1. EKS on Fargate, deployed via CloudFormation using a [custom resource to run kubectl](https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-eks.KubernetesManifest.html). ([jump to instructions](#eks-on-fargate))

### ECS on Fargate (rolling update deployments)

The [cdk](cdk/) folder contains the example '[ecs-service](cdk/ecs-service.ts)' for how to model this service with the [AWS Cloud Development Kit (AWS)](https://github.com/awslabs/aws-cdk) and deploy the service with CloudFormation, using [ECS rolling update deployments](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-type-ecs.html).

See the '[api-service-pipeline](../pipelines/src/api-service-pipeline.ts)' example in the [pipelines](../pipelines/) folder for an example of how to continuously deploy this backend service example with CodePipeline's [CloudFormation deploy actions](https://docs.aws.amazon.com/codepipeline/latest/userguide/integrations-action-type.html#integrations-deploy-CloudFormation), with the pipeline modeled using the AWS CDK.  Instructions are also in the [pipelines](../pipelines/) folder for how to provision the CodePipeline pipeline via CloudFormation.

To deploy this example, run the following.
```
npm install -g aws-cdk

npm install

npm run build

cdk synth -o build --app 'node ecs-service.js'

cdk deploy --app ecs-service.js TriviaBackendTest

cdk deploy --app ecs-service.js TriviaBackendProd
```

Follow the instructions in the [canaries](../canaries) folder to deploy synthetic traffic canaries and their associated alarms.  Lastly, configure rollback alarms on the CloudFormation stacks for the backend services.
```
AWS_ACCOUNT_ID=`aws sts get-caller-identity --query Account --output text`

aws cloudformation update-stack \
   --region us-east-1 \
   --stack-name TriviaBackendTest \
   --use-previous-template \
   --parameters ParameterKey=CertArnParameterParameter,UsePreviousValue=true \
   --capabilities CAPABILITY_IAM \
   --rollback-configuration "RollbackTriggers=[{Arn=arn:aws:cloudwatch:us-east-1:$AWS_ACCOUNT_ID:alarm:TriviaBackendTest-Unhealthy-Hosts,Type=AWS::CloudWatch::Alarm},{Arn=arn:aws:cloudwatch:us-east-1:$AWS_ACCOUNT_ID:alarm:TriviaBackendTest-Http-500,Type=AWS::CloudWatch::Alarm},{Arn=arn:aws:cloudwatch:us-east-1:$AWS_ACCOUNT_ID:alarm:Synthetics-Alarm-trivia-game-test,Type=AWS::CloudWatch::Alarm}]"

aws cloudformation update-stack \
   --region us-east-1 \
   --stack-name TriviaBackendProd \
   --use-previous-template \
   --parameters ParameterKey=CertArnParameterParameter,UsePreviousValue=true \
   --capabilities CAPABILITY_IAM \
   --rollback-configuration "RollbackTriggers=[{Arn=arn:aws:cloudwatch:us-east-1:$AWS_ACCOUNT_ID:alarm:TriviaBackendProd-Unhealthy-Hosts,Type=AWS::CloudWatch::Alarm},{Arn=arn:aws:cloudwatch:us-east-1:$AWS_ACCOUNT_ID:alarm:TriviaBackendProd-Http-500,Type=AWS::CloudWatch::Alarm},{Arn=arn:aws:cloudwatch:us-east-1:$AWS_ACCOUNT_ID:alarm:Synthetics-Alarm-trivia-game-prod,Type=AWS::CloudWatch::Alarm}]"
```

### ECS on Fargate (blue-green deployments)

The [cdk](cdk/) folder contains the example '[ecs-service-blue-green](cdk/ecs-service-blue-green.ts)' for how to model this service with the [AWS Cloud Development Kit (AWS)](https://github.com/awslabs/aws-cdk) and deploy the service with CloudFormation, using [ECS blue-green deployments](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-type-blue-green.html).

See the '[api-service-blue-green-pipeline](../pipelines/src/api-service-blue-green-pipeline.ts)' example in the [pipelines](../pipelines/) folder for an example of how to continuously deploy this backend service example with CodePipeline's [CloudFormation deploy actions](https://docs.aws.amazon.com/codepipeline/latest/userguide/integrations-action-type.html#integrations-deploy-CloudFormation), with the pipeline modeled using the AWS CDK.  Instructions are also in the [pipelines](../pipelines/) folder for how to provision the CodePipeline pipeline via CloudFormation.

To deploy this example, run the following.
```
npm install -g aws-cdk

npm install

npm run build

cdk synth -o build --app 'node ecs-service-blue-green.js'

cdk deploy --app ecs-service-blue-green.js TriviaBackendTest

cdk --app ecs-service-blue-green.js TriviaBackendProd
```

### EKS on Fargate

The [cdk](cdk/) folder contains the example '[eks-service](cdk/eks-service.ts)' for how to model this service with the [AWS Cloud Development Kit (AWS)](https://github.com/awslabs/aws-cdk) and deploy it to EKS on Fargate, using a [CloudFormation custom resource to run kubectl](https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-eks-legacy.KubernetesResource.html)).  Note that this example does not currently have a continuous deployment pipeline example in this repo.

First, install [kubectl](https://github.com/kubernetes/kubectl) and [eksctl](https://github.com/weaveworks/eksctl).

Then install CDK and the required Node dependencies.

```
npm install -g aws-cdk
npm install
```

Next, modify the `TriviaBackendStack` parameters at the bottom of `eks-service.ts` to suit your environment. The value to use for `oidcProvider` will not be available until after the cluster has been deployed for the first time and the rest of the instructions below have been followed, so leave that line commented out.

Now compile the Typescript example and deploy the initial infrastructure:

```
npm run build
cdk deploy --app eks-service.js TriviaBackendProd
```

Once that's finished, you'll need to associate an IAM OIDC Provider to the cluster and obtain the provider URL:

```
eksctl utils associate-iam-oidc-provider --region <insert cluster region here> --cluster <insert cluster name here> --approve

aws eks describe-cluster --name <insert cluster name here> --query "cluster.identity.oidc.issuer" --output text | sed -e "s/^https:\/\///"
```

Copy the `oidc.eks.<region>.amazonaws.com/id/<hexadecimal string>` value that is displayed as output, paste it into the `oidcProvider` parameter value in `eks-service.ts`, uncomment the line, then run `npm run build` and `cdk deploy --app eks-service.js TriviaBackendProd` again.

Run the `aws eks update-kubeconfig` command that is output by CDK next to `TriviaBackendProd.FargateClusterConfigCommandXXXXXXXX = `, then check the status of your cluster using `kubectl get all --all-namespaces`. You may see one or more pods stuck in a `Pending` state, which could happen during the initial creation if Kubernetes tried to schedule them before CDK could finish creating the necessary Fargate Profile.

Your first troubleshooting step should be to rollout a "new" deployment using `kubectl rollout restart -n <namespace> deployment <deployment-name>`, for example:

```
kubectl rollout restart -n kube-system deployment coredns
kubectl rollout restart -n reinvent-trivia deployment api
... etc ...
```

Once the rollout process is complete, `kubectl get all --all-namespaces` will show everything in the `Running` state, and you'll see a `{status:ok}` response when visiting `https://<your api domain name here>` in your browser.
