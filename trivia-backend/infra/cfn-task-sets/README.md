Example of using the ECS 'EXTERNAL' deployment controller and task sets in CloudFormation.

# Create the stack

Follow the steps in the trivia-backend README to create the ECR repo and push an image to the 'latest' tag, then:

```
VPC_ID=`aws ec2 describe-vpcs --region us-east-1 --filters "Name=isDefault, Values=true" --query 'Vpcs[].VpcId' --output text`

SUBNET_IDS=`aws ec2 describe-subnets --region us-east-1 --filters "Name=vpc-id,Values=$VPC_ID","Name=default-for-az,Values=true" --query 'Subnets[].SubnetId' --output text | tr "\\t" ","`

aws cloudformation deploy \
   --region us-east-1 \
   --stack-name reinvent-trivia-backend-task-sets \
   --template-file template.yaml \
   --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND \
   --parameter-overrides \
        Vpc=$VPC_ID \
        Subnets=$SUBNET_IDS \
        ImageTag=latest

aws cloudformation describe-stacks \
   --region us-east-1 \
   --stack-name reinvent-trivia-backend-task-sets \
   --query 'Stacks[].Outputs[].OutputValue' \
   --output text
```
