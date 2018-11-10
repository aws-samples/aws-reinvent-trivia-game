# Useful commands

 * `npm run build`   compile typescript to js
 * `npm run watch`   watch for changes and compile
 * `cdk deploy`      deploy this stack to your default AWS account/region
 * `cdk diff`        compare deployed stack with current state
 * `cdk synth`       emits the synthesized CloudFormation template


aws ssm put-parameter --name CertificateArn-www.reinvent-trivia.com --type String --value arn:aws:acm:...

aws ssm put-parameter --name CertificateArn-test.reinvent-trivia.com --type String --value arn:aws:acm:...

aws ssm put-parameter --name CertificateArn-api.reinvent-trivia.com --type String --value arn:aws:acm:...

aws ssm put-parameter --name CertificateArn-test-api.reinvent-trivia.com --type String --value arn:aws:acm:...

aws ssm put-parameter --name GitHubToken --type String --value 12345