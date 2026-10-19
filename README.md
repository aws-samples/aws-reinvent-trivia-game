## AWS re:Invent Trivia Game

Sample trivia game built with AWS Fargate, AWS Lambda, and Amazon Lex.  See [reinvent-trivia.com](https://www.reinvent-trivia.com) for a running example.

## Components

* **Backend API Service** ([folder](trivia-backend/)): REST API that serves trivia questions and answers.  Runs on AWS Fargate, either with Amazon ECS or with Amazon EKS.
* **Static Site** ([folder](static-site/)): Web application page, backed by Amazon S3, Amazon CloudFront, and Amazon Route53.
* **Chat Bot** ([folder](chat-bot/)): Conversational bot that asks trivia questions and validates answers, and can be integrated into Slack workspace.  Running on Amazon Lex and AWS Lambda.
* **Continuous Delivery** ([folder](pipelines/)): Pipelines that deploy code and infrastructure for each of the components.
* **Canaries** ([folder](canaries/)): Monitoring canaries to continuously test the application and alarm in case of issues.
* **Alarms** ([folder](alarms/)): E-mail and chat notifications for alarms in case of issues.

The components above are almost entirely deployed with AWS CloudFormation, using either the [AWS Cloud Development Kit](https://aws.amazon.com/cdk/) or the [AWS Serverless Application Model](https://aws.amazon.com/serverless/sam/).

## License Summary

This sample code is made available under the MIT license. See the LICENSE file.

## Credits

Static site based on [React Trivia](https://github.com/ccoenraets/react-trivia)

## GitHub Actions setup

The "Game App" CI job pulls base images from Amazon ECR Public.
Anonymous pulls from GitHub-hosted runners are often rate-limited, so the job logs in to ECR Public
when the `ECR_PUBLIC_ROLE_ARN` secret is set. To set it up:

1. Deploy a least-privilege IAM role that GitHub Actions can assume with OIDC.
   If the AWS account already has a GitHub OIDC provider, also pass `OIDCProviderArn=<provider ARN>`.

```bash
aws cloudformation deploy \
    --template-file .github/github-actions-authentication.yaml \
    --stack-name github-reinvent-trivia-ci-identity-provider \
    --parameter-overrides GitHubOrg=aws-samples RepositoryName=aws-reinvent-trivia-game \
    --capabilities CAPABILITY_IAM \
    --region us-east-1

aws cloudformation describe-stacks \
    --stack-name github-reinvent-trivia-ci-identity-provider \
    --query "Stacks[0].Outputs[?OutputKey=='Role'].OutputValue" \
    --output text \
    --region us-east-1
```

2. Store the role ARN as a repository secret named `ECR_PUBLIC_ROLE_ARN`, both as an Actions secret
   and as a Dependabot secret, so that Dependabot pull requests can log in too.
   Pull requests from forks don't get secrets, so they keep pulling anonymously.
