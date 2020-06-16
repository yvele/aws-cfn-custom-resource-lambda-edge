#!/usr/bin/env bash
set -e


# Parse script parameters
while [[ "$#" -gt 0 ]]; do
  case $1 in
    --region) REGION="$2"; shift;;
    --package-bucket) PACKAGE_BUCKET="$2"; shift;;
    *) echo "Unknown parameter: $1"; exit 1;;
  esac
  shift
done

if [ -z "$REGION" ]; then
  echo "Region parameter is not set"
  exit 1
fi



if [ -z "$PACKAGE_BUCKET" ]; then

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

fi



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
