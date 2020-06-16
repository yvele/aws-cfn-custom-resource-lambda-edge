# aws-cfn-custom-resource-lambda-edge

<a href="https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/template-custom-resources.html">
  <img align="right" alt="CloudFormation" src="docs/media/cfn-logo.png" title="CloudFormation custom resource" height="150"/>
</a>

> This project provides a `Custom::Resource` for AWS CloudFormation that copies an existing Lambda deployment to another region. Specially useful for [Lambda@Edge](https://aws.amazon.com/lambda/edge/).


[![Node](https://img.shields.io/badge/node-v12.x-blue.svg)](https://nodejs.org)


## Motivation

- https://github.com/awslabs/serverless-application-model/issues/635
- https://twitter.com/prestomation/status/971256051516485632


## Installation

Clone the repository.

[Setup your AWS CLI credentials](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html) before running the script.

Run the script that installs the CloudFormation custom resource and it's dependencies. The first argument is the AWS region where you want the custom resource to be installed.

```sh
./install.sh eu-west-1
```

The scripts will deploy 3 CloudFormation stacks. When done,
the script will prompt you to deploy and optional CloudFront sample.

Note that the first stack is a prerequisite that deploys an S3 bucket required by CloudFormation to [upload local artifacts](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-cli-package.html). You probably already have such bucket.


## Usage

### With the default execution role

```yaml
AWSTemplateFormatVersion: 2010-09-09
Transform: AWS::Serverless-2016-10-31
Resources:

  # CloudFront distribution
  Distribution:
    Type: AWS::CloudFront::Distribution
    Properties:
      DistributionConfig:
        DefaultCacheBehavior:
          LambdaFunctionAssociations:
            - EventType: origin-request
              LambdaFunctionARN: !GetAtt EdgeOriginRequest.FunctionVersion

  # Unused Lambda function only to get `CodeUri` working
  EdgeOriginRequestSource:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: ./src
      AutoPublishAlias: live  # Required to get `Version` parameter and force publication

  # Custom resource to "copy" the Lambda in the standard region (us-east-1)
  EdgeOriginRequest:
    Type: Custom::LambdaEdge
    Properties:
      ServiceToken: !ImportValue CustomResourceLambdaEdgeServiceToken
      Parameters:
        LambdaSourceArn: !Ref EdgeOriginRequestSource.Version
```


### With a custom execution role

```yaml
AWSTemplateFormatVersion: 2010-09-09
Transform: AWS::Serverless-2016-10-31
Resources:

  # CloudFront distribution
  Distribution:
    Type: AWS::CloudFront::Distribution
    Properties:
      DistributionConfig:
        DefaultCacheBehavior:
          LambdaFunctionAssociations:
            - EventType: origin-request
              LambdaFunctionARN: !GetAtt EdgeOriginRequest.FunctionVersion

  # Unused Lambda function only to get `CodeUri` working
  EdgeOriginRequestSource:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: ./src
      AutoPublishAlias: live  # Required to get `Version` parameter and force publication

  # Custom resource to "copy" the Lambda in the standard region (us-east-1)
  EdgeOriginRequest:
    Type: Custom::LambdaEdge
    Properties:
      ServiceToken: !ImportValue CustomResourceLambdaEdgeServiceToken
      Parameters:
        LambdaSourceArn: !Ref EdgeOriginRequestSource.Version
        LambdaRoleArn: !Ref EdgeOriginRequestRole

  # Custom execution role
  EdgeOriginRequestRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: 2012-10-17
        Statement:
          - Effect: Allow
            Action: sts:AssumeRole
            Principal:
              Service:
                - lambda.amazonaws.com
                - edgelambda.amazonaws.com
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
        - arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess
      Policies:
        - PolicyName: CustomPolicy
          PolicyDocument:
            Version   : 2012-10-17
            Statement :
              - Effect: Allow
                Resource: "*"
                Action: lambda:InvokeFunction
```


## License

[Apache 2.0](LICENSE) © Yves Merlicco
