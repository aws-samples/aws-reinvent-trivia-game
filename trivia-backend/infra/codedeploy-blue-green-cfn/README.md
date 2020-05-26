Example of performing ECS blue/green deployments through CodeDeploy using CloudFormation.

# Documentation

CodeDeploy: https://docs.aws.amazon.com/codedeploy/latest/userguide/deployments-create-ecs-cfn.html

CloudFormation: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/blue-green.html

# Prepare two container images

Create an ECR repository for the application image:
```
aws ecr create-repository --region us-east-1 --tags Key=project,Value=reinvent-trivia --repository-name reinvent-trivia-backend
```

Push a 'hello world' image for the first image:
```
AWS_ACCOUNT_ID=`aws sts get-caller-identity --query Account --output text`

docker pull nginxdemos/hello

aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com

docker tag nginxdemos/hello $AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/reinvent-trivia-backend:hello

docker push $AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/reinvent-trivia-backend:hello
```

Then build and push the reInvent Trivia API image from the [trivia-backend](../../) folder:
```
AWS_ACCOUNT_ID=`aws sts get-caller-identity --query Account --output text`

docker build -t reinvent-trivia-backend-base:release base/

docker build -t reinvent-trivia-backend:latest .

aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com

docker tag reinvent-trivia-backend:latest $AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/reinvent-trivia-backend:latest

docker push $AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/reinvent-trivia-backend:latest
```

# Create the initial service stack

```
AWS_ACCOUNT_ID=`aws sts get-caller-identity --query Account --output text`

VPC_ID=`aws ec2 describe-vpcs --region us-east-1 --filters "Name=isDefault, Values=true" --query 'Vpcs[].VpcId' --output text`

SUBNET_1=`aws ec2 describe-subnets --region us-east-1 --filters "Name=vpc-id,Values=$VPC_ID" "Name=default-for-az,Values=true" --query 'Subnets[0].SubnetId' --output text | tr "\\t" ","`

SUBNET_2=`aws ec2 describe-subnets --region us-east-1 --filters "Name=vpc-id,Values=$VPC_ID" "Name=default-for-az,Values=true" --query 'Subnets[1].SubnetId' --output text | tr "\\t" ","`

aws cloudformation deploy \
   --region us-east-1 \
   --stack-name reinvent-trivia-backend-codedeploy-blue-green-cfn \
   --template-file template.yaml \
   --capabilities CAPABILITY_NAMED_IAM \
   --parameter-overrides \
        Vpc=$VPC_ID \
        Subnet1=$SUBNET_1 \
        Subnet2=$SUBNET_2 \
        ImageUrl=$AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/reinvent-trivia-backend:hello

aws cloudformation describe-stacks \
   --region us-east-1 \
   --stack-name reinvent-trivia-backend-codedeploy-blue-green-cfn \
   --query 'Stacks[].Outputs'
```

# Configure alarm-based auto-rollback

```
AWS_ACCOUNT_ID=`aws sts get-caller-identity --query Account --output text`

aws cloudformation update-stack \
   --region us-east-1 \
   --stack-name reinvent-trivia-backend-codedeploy-blue-green-cfn \
   --use-previous-template \
   --rollback-configuration "RollbackTriggers=[{Arn=arn:aws:cloudwatch:us-east-1:$AWS_ACCOUNT_ID:alarm:reinvent-trivia-backend-codedeploy-blue-green-cfn-Rollback-Trigger,Type=AWS::CloudWatch::Alarm}]"
```

# Trigger a blue-green deployment

```
AWS_ACCOUNT_ID=`aws sts get-caller-identity --query Account --output text`

aws cloudformation deploy \
   --region us-east-1 \
   --stack-name reinvent-trivia-backend-codedeploy-blue-green-cfn \
   --template-file template.yaml \
   --capabilities CAPABILITY_NAMED_IAM \
   --parameter-overrides \
        ImageUrl=$AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/reinvent-trivia-backend:latest
```

# Cleanup

```
aws cloudformation delete-stack \
 --stack-name reinvent-trivia-backend-codedeploy-blue-green-cfn \
 --region us-east-1
```