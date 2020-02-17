## AWS re:Invent 2019 Trivia Game

Sample trivia game built with AWS Fargate, AWS Lambda, and Amazon Lex.  See [reinvent-trivia.com](https://www.reinvent-trivia.com) for a running example.

## Components

* **Backend API Service** ([folder](trivia-backend/)): REST API that serves trivia questions and answers.  Runs on AWS Fargate, either with Amazon ECS or with Amazon EKS.
* **Static Site** ([folder](static-site/)): Web application page, backed by Amazon S3, Amazon CloudFront, and Amazon Route53.
* **Chat Bot** ([folder](chat-bot/)): Conversational bot that asks trivia questions and validates answers, and can be integrated into Slack workspace.  Running on Amazon Lex and AWS Lambda.
* **Continuous delivery** ([folder](pipelines/)): Pipelines that deploy code and infrastructure for each of the components.
* **Canaries** ([folder](canaries/)): Monitoring canaries to continuously test the application and alarm in case of issues.

## License Summary

This sample code is made available under the MIT license. See the LICENSE file.

## Credits

Static site based on [React Trivia](https://github.com/ccoenraets/react-trivia)
