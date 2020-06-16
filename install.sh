#!/usr/bin/env bash
set -e


REGION=$1
if [ -z "$REGION" ]
then
  echo "You must pass an AWS region as first argument"
  exit 1
fi


echo
echo "  ================================================================="
echo "  0. Prerequisite"
echo "  --------------------------"
echo "  Deploy the S3 bucket that will host local artifacts uploaded by"
echo "  CloudFormation when packing in ${REGION}."
echo "  ================================================================="

aws cloudformation deploy \
  --region ${REGION} \
  --template-file stacks/package-bucket/cloudformation.yml \
  --stack-name package-bucket \
  --no-fail-on-empty-changeset

PACKAGE_BUCKET=$(aws cloudformation describe-stack-resource \
  --region ${REGION} \
  --stack-name package-bucket \
  --logical-resource-id Bucket \
  --output text \
  --query StackResourceDetail.PhysicalResourceId)

echo "Deployed S3 bucket name: ${PACKAGE_BUCKET}"



echo
echo "  ================================================================="
echo "  1. us-east-1 deployment"
echo "  --------------------------"
echo "  Deploy the bucket that will host Lambda@Edge code in us-east-1"
echo "  ================================================================="

aws cloudformation deploy \
  --region us-east-1 \
  --template-file stacks/lambda-edge-code-bucket/cloudformation.yml \
  --stack-name lambda-edge-code-bucket \
  --no-fail-on-empty-changeset

LAMBDA_EDGE_CODE_BUCKET=$(aws cloudformation describe-stack-resource \
  --region us-east-1 \
  --stack-name lambda-edge-code-bucket \
  --logical-resource-id Bucket \
  --output text \
  --query StackResourceDetail.PhysicalResourceId)



echo
echo "  ================================================================="
echo "  2. ${REGION} deployment"
echo "  --------------------------"
echo "  Deploy the CloudFormation custom resource in ${REGION}"
echo "  ================================================================="

echo
echo "Pack CloudFormation template and upload artifacts to ${PACKAGE_BUCKET} in ${REGION}"
mkdir -p tmp/custom-resource-lambda-edge
aws cloudformation package \
  --region ${REGION} \
  --template-file stacks/custom-resource-lambda-edge/cloudformation.yml \
  --output-template-file tmp/custom-resource-lambda-edge/cloudformation.yml \
  --s3-bucket ${PACKAGE_BUCKET} \
  --s3-prefix cloudformation/custom-resource-lambda-edge

echo "Deploy CloudFormation template in ${REGION}"
aws cloudformation deploy \
  --region ${REGION} \
  --template-file tmp/custom-resource-lambda-edge/cloudformation.yml \
  --stack-name custom-resource-lambda-edge \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides \
  LambdaEdgeCodeBucket=${LAMBDA_EDGE_CODE_BUCKET}


echo
read -p "Do you want to deploy the optional sample stack? [yN]" -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    exit 0
fi

echo
echo "  ================================================================="
echo "  x. Sample stack deployment"
echo "  --------------------------"
echo "  Deploy the CloudFormation sample stack in ${REGION}"
echo "  ================================================================="

mkdir -p tmp/cloudfront-sample
aws cloudformation package \
  --region ${REGION} \
  --template-file stacks/cloudfront-sample/cloudformation.yml \
  --output-template-file tmp/cloudfront-sample/cloudformation.yml \
  --s3-bucket ${PACKAGE_BUCKET} \
  --s3-prefix cloudformation/cfn-cloudfront-sample
aws cloudformation deploy \
  --region ${REGION} \
  --template-file tmp/cloudfront-sample/cloudformation.yml \
  --stack-name cloudfront-sample \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides \
  LambdaEdgeCodeBucket=${LAMBDA_EDGE_CODE_BUCKET}
