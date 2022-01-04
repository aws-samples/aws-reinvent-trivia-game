## AWS re:Invent Trivia Game

Sample trivia game built with AWS Fargate, AWS Lambda, and Amazon Lex.  See [reinvent-trivia.com](https://www.reinvent-trivia.com) for a running example.

## Components

* **Backend API Service** ([folder](trivia-backend/)): REST API that serves trivia questions and answers.  Runs on AWS Fargate, either with Amazon ECS or with Amazon EKS.
* **Static Site** ([folder](static-site/)): Web application page, backed by Amazon S3, Amazon CloudFront, and Amazon Route53.
* **Chat Bot** ([folder](chat-bot/)): Conversational bot that asks trivia questions and validates answers, and can be integrated into Slack workspace.  Running on Amazon Lex and AWS Lambda.
* **Continuous delivery** ([folder](pipelines/)): Pipelines that deploy code and infrastructure for each of the components.
* **Canaries** ([folder](canaries/)): Monitoring canaries to continuously test the application and alarm in case of issues.
* **Alarms** ([folder](alarms/)): E-mail and chat notifications for alarms in case of issues.

The components above are almost entirely deployed with AWS CloudFormation, using either the [AWS Cloud Development Kit](https://aws.amazon.com/cdk/) or the [AWS Serverless Application Model](https://aws.amazon.com/serverless/sam/).

## License Summary

This sample code is made available under the MIT license. See the LICENSE file.

## Credits

Static site based on [React Trivia](https://github.com/ccoenraets/react-trivia)
