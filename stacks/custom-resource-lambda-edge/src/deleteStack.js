const { S3, CloudFormation } = require("aws-sdk");
const getEnvOrThrow = require("./helpers/getEnvOrThrow");
const parseStackArn = require("./helpers/parseStackArn");
const parseLambdaArn = require("./helpers/parseLambdaArn");


// The deletion of the Lambda@Edge stack is estimated at 1 minute max
const STACK_DELETION_DURATION = 60000;


/**
 * @param {object} event
 * @param {string} event.LogicalResourceId
 * @param {object} event.ResourceProperties
 * @param {object} event.ResourceProperties.Parameters
 * @param {string} event.ResourceProperties.Parameters.LambdaSourceArn
 * @param {object} context AWS Lambda context object
 * @param {Function} context.getRemainingTimeInMillis Returns the number of milliseconds
 * left before the execution times out
 * @returns {object}
 */
module.exports = async function deleteStack(event, context) {
  const lambdaEdgeCodeBucket = getEnvOrThrow("LAMBDA_EDGE_CODE_BUCKET");
  const lambdaEdgeCodeKeyPrefix = getEnvOrThrow("LAMBDA_EDGE_CODE_KEY_PREFIX");
  const lambdaEdgeRegion = getEnvOrThrow("LAMBDA_EDGE_REGION");


  const sourceStack = parseStackArn(event.StackId);
  const logicalResourceId = event.LogicalResourceId;
  const parameters = event.ResourceProperties.Parameters;


  // 1. Delete stack
  const stackName = `${sourceStack.name}-${logicalResourceId}`;
  console.info("Delete stack", stackName);
  const cfn = new CloudFormation({ region: lambdaEdgeRegion });

  // We may be unable to delete Lambda@Edge because it is a replicated function
  // https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-edge-delete-replicas.html
  try {
    await cfn.deleteStack({ StackName: stackName }).promise();
    await cfn.waitFor("stackDeleteComplete", { StackName: stackName }).promise();
  } catch (err) {
    if (err.code !== "ResourceNotReady") {
      throw err;
    }
    const delay = context.getRemainingTimeInMillis() - STACK_DELETION_DURATION;
    if (delay <= 0) {
      throw err;
    }

    console.error(err);
    console.warn(`Waiting ${Math.round(delay / 1000)} seconds before retrying stack deletion`);
    await new Promise(resolve => setTimeout(resolve, delay));

    console.info("Retry delete stack", stackName);
    await cfn.deleteStack({ StackName: stackName }).promise();
    await cfn.waitFor("stackDeleteComplete", { StackName: stackName }).promise();
  }


  // 2. Delete source code object
  const sourceArn = parameters.LambdaSourceArn;
  const source = parseLambdaArn(sourceArn);
  if (source.name === undefined) {
    throw new InvalidOperationError(
      `Parameter LambdaSourceArn "${sourceArn}" must be a valid Lambda ARN`
    );
  }
  const codeUri = {
    region : lambdaEdgeRegion,
    bucket : lambdaEdgeCodeBucket,
    key : `${lambdaEdgeCodeKeyPrefix}${source.name}`
  };
  console.info("Deleting source code", codeUri);
  const s3 = new S3({ region: codeUri.region });
  await s3.deleteObject({
    Bucket : codeUri.bucket,
    Key : codeUri.key
  }).promise();

};
