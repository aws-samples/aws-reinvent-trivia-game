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

Replace all references to 'reinvent-trivia.com' with your own domain name.

## Build Docker images

The base image Dockerfile can be found in the [base](base/) folder.  In the example pipelines modeled in the "[pipelines](../pipelines/)" folder, the base image is built in one "base image" pipeline, which triggers another pipeline for the main application.  In the main application pipeline, the base image URI is replaced in the main Dockerfile with the latest base image that triggered the pipeline.

Locally, it can be built with the following commands.  Follow the "push commands" instructions in the ECR console to push them into the ECR repository.

```
docker build -t reinvent-trivia-backend-base:release base/

docker build -t reinvent-trivia-backend:latest .
```

## Provision using infrastructure as code

There are multiple options in the [infra](infra/) folder for provisioning and deploying the backend services.  See instructions below for how to set up each of these options.
1. ECS on Fargate, deployed via CloudFormation using [ECS rolling update deployments](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-type-ecs.html). ([jump to instructions](#ecs-on-fargate-rolling-update-deployments))
1. ECS on Fargate, deployed via CloudFormation using [ECS task set deployments](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-type-external.html). ([jump to instructions](#ecs-on-fargate-task-set-deployments))
1. ECS on Fargate, deployed via CloudFormation using [CodeDeploy blue-green deployments](https://docs.aws.amazon.com/codedeploy/latest/userguide/deployments-create-ecs-cfn.html). ([jump to instructions](#ecs-on-fargate-codedeploy-blue-green-deployments))
1. ECS on Fargate, deployed using [CodeDeploy blue-green deployments](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-type-bluegreen.html) outside of CloudFormation. ([jump to instructions](#ecs-on-fargate-codedeploy-blue-green-deployments-outside-of-cloudformation))
1. EKS on Fargate, deployed via CloudFormation using a [custom resource to run kubectl](https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-eks.KubernetesManifest.html). ([jump to instructions](#eks-on-fargate))

### ECS on Fargate (rolling update deployments)

The [cdk](infra/cdk/) folder contains the example '[ecs-service](infra/cdk/ecs-service.ts)' for how to model this service with the [AWS Cloud Development Kit (AWS)](https://github.com/awslabs/aws-cdk) and deploy the service with CloudFormation, using [ECS rolling update deployments](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-type-ecs.html).

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

### ECS on Fargate (task set deployments)

The [cdk](infra/cdk/) folder contains the example '[ecs-task-sets](infra/cdk/ecs-service.ts)' for how to model this service with the [AWS Cloud Development Kit (AWS)](https://github.com/awslabs/aws-cdk) and deploy the service with CloudFormation, using [ECS task set deployments](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-type-external.html).  Note that this example does not currently have a continuous deployment pipeline example in this repo.

To deploy this example, run the following.
```
npm install -g aws-cdk

npm install

npm run build

cdk synth -o build --app 'node ecs-task-sets.js'

cdk deploy --app ecs-task-sets.js TriviaBackendTaskSets
```

### ECS on Fargate (CodeDeploy blue-green deployments)

The [cdk](infra/cdk/) folder contains the example '[ecs-service-blue-green](infra/cdk/ecs-service-blue-green.ts)' for how to model this service with the [AWS Cloud Development Kit (AWS)](https://github.com/awslabs/aws-cdk) and deploy the service with CloudFormation, using [CodeDeploy blue-green deployments](https://docs.aws.amazon.com/codedeploy/latest/userguide/deployments-create-ecs-cfn.html).  The [codedeploy-lifecycle-event-hooks](infra/codedeploy-lifecycle-event-hooks) folder contains an example of a pre-traffic CodeDeploy lifecycle event hook that is modeled and provisioned with CloudFormation and the [AWS Serverless Application Model](https://aws.amazon.com/serverless/sam/).

See the '[api-service-blue-green-pipeline](../pipelines/src/api-service-blue-green-pipeline.ts)' example in the [pipelines](../pipelines/) folder for an example of how to continuously deploy this backend service example with CodePipeline's [CloudFormation deploy actions](https://docs.aws.amazon.com/codepipeline/latest/userguide/integrations-action-type.html#integrations-deploy-CloudFormation), with the pipeline modeled using the AWS CDK.  Instructions are also in the [pipelines](../pipelines/) folder for how to provision the CodePipeline pipeline via CloudFormation.

To deploy this example, first deploy the CodeDeploy lifecycle event hook from the `infra/codedeploy-lifecycle-event-hooks` folder:
```
npm install

aws cloudformation package \
  --template-file template.yaml \
  --output-template-file packaged-template.yaml \
  --s3-bucket <S3 bucket for storing the Lambda function code>

aws cloudformation deploy \
  --region us-east-1 \
  --template-file packaged-template.yaml \
  --stack-name TriviaBackendHooksTest \
  --tags project=reinvent-trivia \
  --capabilities CAPABILITY_NAMED_IAM \
  --tags project=reinvent-trivia \
  --parameter-overrides TriviaBackendDomain=api-test.reinvent-trivia.com

aws cloudformation deploy \
  --region us-east-1 \
  --template-file packaged-template.yaml \
  --stack-name TriviaBackendHooksProd \
  --tags project=reinvent-trivia \
  --capabilities CAPABILITY_NAMED_IAM \
  --tags project=reinvent-trivia \
  --parameter-overrides TriviaBackendDomain=api.reinvent-trivia.com
```

Then, build and deploy the backend service stacks using the AWS CDK from the `infra/cdk` folder:
```
npm install -g aws-cdk

npm install

npm run build

cdk --no-version-reporting synth -o build --app 'node ecs-service-blue-green.js'

cdk --no-version-reporting deploy --app ecs-service-blue-green.js TriviaBackendTest

cdk --no-version-reporting deploy --app ecs-service-blue-green.js TriviaBackendProd
```
> Note: Using the `--no-version-reporting` option with the CDK CLI is important for CodeDeploy blue-green templates.  The CodeDeploy template hook prevents changes to the ECS resources and changes to non-ECS resources from occurring in the same stack update, because the stack update cannot be done in a safe blue-green fashion.  By default, the CDK inserts a `AWS::CDK::Metadata` resource into the template it generates.  If not using the `--no-version-reporting` option and the CDK libraries are upgraded, the `AWS::CDK::Metadata` resource will change and can result in a validation error from the CodeDeploy hook about non-ECS resource changes.

Follow the instructions in the [canaries](../canaries) folder to deploy synthetic traffic canaries and their associated alarms.  Lastly, configure rollback alarms on the CloudFormation stacks for the backend services.
```
AWS_ACCOUNT_ID=`aws sts get-caller-identity --query Account --output text`

aws cloudformation update-stack \
   --region us-east-1 \
   --stack-name TriviaBackendTest \
   --use-previous-template \
   --parameters ParameterKey=CertArnParameterParameter,UsePreviousValue=true \
   --capabilities CAPABILITY_IAM \
   --rollback-configuration "RollbackTriggers=[{Arn=arn:aws:cloudwatch:us-east-1:$AWS_ACCOUNT_ID:alarm:TriviaBackendTest-Unhealthy-Hosts-Blue,Type=AWS::CloudWatch::Alarm},{Arn=arn:aws:cloudwatch:us-east-1:$AWS_ACCOUNT_ID:alarm:TriviaBackendTest-Http-500-Blue,Type=AWS::CloudWatch::Alarm},{Arn=arn:aws:cloudwatch:us-east-1:$AWS_ACCOUNT_ID:alarm:TriviaBackendTest-Unhealthy-Hosts-Green,Type=AWS::CloudWatch::Alarm},{Arn=arn:aws:cloudwatch:us-east-1:$AWS_ACCOUNT_ID:alarm:TriviaBackendTest-Http-500-Green,Type=AWS::CloudWatch::Alarm},{Arn=arn:aws:cloudwatch:us-east-1:$AWS_ACCOUNT_ID:alarm:Synthetics-Alarm-trivia-game-test,Type=AWS::CloudWatch::Alarm}]"

aws cloudformation update-stack \
   --region us-east-1 \
   --stack-name TriviaBackendProd \
   --use-previous-template \
   --parameters ParameterKey=CertArnParameterParameter,UsePreviousValue=true \
   --capabilities CAPABILITY_IAM \
   --rollback-configuration "RollbackTriggers=[{Arn=arn:aws:cloudwatch:us-east-1:$AWS_ACCOUNT_ID:alarm:TriviaBackendProd-Unhealthy-Hosts-Blue,Type=AWS::CloudWatch::Alarm},{Arn=arn:aws:cloudwatch:us-east-1:$AWS_ACCOUNT_ID:alarm:TriviaBackendProd-Http-500-Blue,Type=AWS::CloudWatch::Alarm},{Arn=arn:aws:cloudwatch:us-east-1:$AWS_ACCOUNT_ID:alarm:TriviaBackendProd-Unhealthy-Hosts-Green,Type=AWS::CloudWatch::Alarm},{Arn=arn:aws:cloudwatch:us-east-1:$AWS_ACCOUNT_ID:alarm:TriviaBackendProd-Http-500-Green,Type=AWS::CloudWatch::Alarm},{Arn=arn:aws:cloudwatch:us-east-1:$AWS_ACCOUNT_ID:alarm:Synthetics-Alarm-trivia-game-prod,Type=AWS::CloudWatch::Alarm}]"
```

### ECS on Fargate (CodeDeploy blue-green deployments, outside of CloudFormation)

The [codedeploy-blue-green](infra/codedeploy-blue-green/) folder contains an example of the configuration needed to setup and execute a [blue-green deployment with CodeDeploy](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-type-bluegreen.html) directly: CodeDeploy appspec file, ECS task definition file, ECS service, CodeDeploy application definition, and CodeDeploy deployment group.

In this example, the infrastructure resources (load balancer, security groups, roles, etc) are modeled and provisioned with the [AWS CDK](https://github.com/awslabs/aws-cdk) and CloudFormation.  The ECS service and CodeDeploy resources are created outside of CloudFormation using a script, and all future deployments to the ECS service are done directly with CodeDeploy outside of CloudFormation.  Note that the setup of resources for this example cannot currently be done entirely with CloudFormation, unless custom CFN resources are used (see [this issue for details](https://github.com/aws-cloudformation/aws-cloudformation-coverage-roadmap/issues/483)).

The [codedeploy-lifecycle-event-hooks](infra/codedeploy-lifecycle-event-hooks) folder contains an example of a pre-traffic CodeDeploy lifecycle event hook that is modeled and provisioned with CloudFormation and the [AWS Serverless Application Model](https://aws.amazon.com/serverless/sam/).

See the '[api-service-codedeploy-pipeline](../pipelines/src/api-service-codedeploy-pipeline.ts)' example in the [pipelines](../pipelines/) folder for an example of how to continuously deploy this backend service example with CodePipeline's ["ECS (Blue/Green)" deploy action](https://docs.aws.amazon.com/codepipeline/latest/userguide/integrations-action-type.html#integrations-deploy-ECS), with the pipeline modeled using the AWS CDK.  Instructions are also in the [pipelines](../pipelines/) folder for how to provision the CodePipeline pipeline via CloudFormation.

To deploy this example, run the following in infra/codedeploy-blue-green.
```
npm install -g aws-cdk

./setup.sh <S3 bucket for storing temporary artifacts>
```

### EKS on Fargate

The [cdk](infra/cdk/) folder contains the example '[eks-service](infra/cdk/eks-service.ts)' for how to model this service with the [AWS Cloud Development Kit (AWS)](https://github.com/awslabs/aws-cdk) and deploy it to EKS on Fargate, using a [CloudFormation custom resource to run kubectl](https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-eks-legacy.KubernetesResource.html)).  Note that this example does not currently have a continuous deployment pipeline example in this repo.

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
