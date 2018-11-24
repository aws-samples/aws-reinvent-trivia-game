# Deploy

npm install

aws cloudformation package --template-file template.yaml --s3-bucket <bucket-name> --output-template-file packaged-template.yaml

aws cloudformation deploy --template-file packaged-template.yaml --stack-name TriviaBackendHooksTest --capabilities CAPABILITY_IAM --parameter-overrides TriviaBackendDomain=api-test.reinvent-trivia.com

aws cloudformation deploy --template-file packaged-template.yaml --stack-name TriviaBackendHooksProd --capabilities CAPABILITY_IAM --parameter-overrides TriviaBackendDomain=api.reinvent-trivia.com