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

The base image Dockerfile can be found in the [base](base/) folder.  In the backend pipeline modeled in the "[pipelines](../pipelines/)" folder, the base image is built in one "base image" pipeline, which triggers another pipeline for the main application.  In the main application pipeline, the base image URI is replaced in the main Dockerfile with the latest base image that triggered the pipeline.

Locally, it can be built with the following commands.  Follow the "push commands" instructions in the ECR console to push them into the ECR repository.

```
docker build -t reinvent-trivia-backend-base:release base/

docker build -t reinvent-trivia-backend:latest .
```

## Provision using infrastructure as code

There are multiple options in the [infra](infra/) folder for provisioning and deploying the backend services.  See instructions below for how to set up each of these options.
1. ECS on Fargate, deployed via CloudFormation using [ECS rolling update deployments](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-type-ecs.html)
1. ECS on Fargate, deployed via CloudFormation using [ECS task set deployments](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-type-external.html)
1. ECS on Fargate, deployed via CloudFormation using [CodeDeploy blue-green deployments](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/blue-green.html)
1. ECS on Fargate, deployed using [CodeDeploy blue-green deployments](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-type-bluegreen.html) outside of CloudFormation
1. EKS on Fargate, deployed via CloudFormation using a [CloudFormation custom resource to run kubectl](https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-eks.KubernetesManifest.html)

### ECS on Fargate (rolling update deployments)

The [cdk](infra/cdk/) folder contains the example 'ecs-service' for how to model this service with the [AWS Cloud Development Kit (AWS)](https://github.com/awslabs/aws-cdk) and deploy the service with CloudFormation, using [ECS rolling update deployments](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-type-ecs.html).

To deploy the Typescript example, run the following.
```
npm install -g aws-cdk

npm install

npm run build

cdk synth -o build --app 'node ecs-service.js'

cdk deploy --app ecs-service.js TriviaBackendTest

cdk deploy --app ecs-service.js TriviaBackendProd
```

See the 'api-service-pipeline' example in the [pipelines](../pipelines/) folder for instructions on how to continuously deploy this example with CodePipeline's [CloudFormation deploy action](https://docs.aws.amazon.com/codepipeline/latest/userguide/integrations-action-type.html#integrations-deploy-CloudFormation).

### ECS on Fargate (task set deployments)

The [cdk](infra/cdk/) folder contains the example 'ecs-task-sets' for how to model this service with the [AWS Cloud Development Kit (AWS)](https://github.com/awslabs/aws-cdk) and deploy the service with CloudFormation, using [ECS task set deployments](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-type-external.html).  Note that this example does not currently have a continuous deployment pipeline example in this repo.

To deploy the Typescript example, run the following.
```
npm install -g aws-cdk

npm install

npm run build

cdk synth -o build --app 'node ecs-task-sets.js'

cdk deploy --app ecs-task-sets.js TriviaBackendTaskSets
```

### ECS on Fargate (CodeDeploy blue-green deployments, outside of CloudFormation)

The [codedeploy-blue-green](infra/codedeploy-blue-green/) folder contains an example of the configuration needed to setup and execute a [blue-green deployment with CodeDeploy](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-type-bluegreen.html) directly: CodeDeploy appspec file, ECS task definition file, ECS service, CodeDeploy application definition, and CodeDeploy deployment group.

The non-service infrastructure (load balancer, security groups, roles, etc) is modeled and provisioned with the AWS CDK and CloudFormation.  A sample pre-traffic CodeDeploy hook is modeled and provisioned with CloudFormation.  In this example, the ECS service is initially created outside of CloudFormation, and all future deployments are done directly with CodeDeploy outside of CloudFormation.

To deploy this example, run the following in infra/codedeploy-blue-green.
```
npm install -g aws-cdk

./setup.sh <S3 bucket for storing temporary artifacts>
```

See the 'api-service-codedeploy-pipeline' example in the [pipelines](../pipelines/) folder for instructions on how to continuously deploy this example with CodePipeline's ["ECS (Blue/Green)" deploy action](https://docs.aws.amazon.com/codepipeline/latest/userguide/integrations-action-type.html#integrations-deploy-ECS).

### EKS on Fargate

The [cdk](infra/cdk/) folder contains the example 'eks-service' for how to model this service with the [AWS Cloud Development Kit (AWS)](https://github.com/awslabs/aws-cdk) and deploy it to EKS on Fargate, using a [CloudFormation custom resource to run kubectl](https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-eks-legacy.KubernetesResource.html)).  Note that this example does not currently have a continuous deployment pipeline example in this repo.

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
