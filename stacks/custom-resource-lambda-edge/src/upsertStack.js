const fs = require("fs");
const path = require("path");
const url = require("url");
const https = require("https");
const { S3, CloudFormation, Lambda } = require("aws-sdk");
const getEnvOrThrow = require("./helpers/getEnvOrThrow");
const parseStackArn = require("./helpers/parseStackArn");
const parseLambdaArn = require("./helpers/parseLambdaArn");


/**
 * @param {object} event
 * @param {string} event.LogicalResourceId
 * @param {string} event.RequestType May be "Create" or "Update"
 * @param {object} event.ResourceProperties
 * @param {object} event.ResourceProperties.Parameters
 * @param {string} event.ResourceProperties.Parameters.LambdaSourceArn
 * @param {string=} event.ResourceProperties.Parameters.LambdaRoleArn Optional
 * @returns {object}
 */
module.exports = async function upsertStack(event) {
  const lambdaEdgeCodeBucket = getEnvOrThrow("LAMBDA_EDGE_CODE_BUCKET");
  const lambdaEdgeCodeKeyPrefix = getEnvOrThrow("LAMBDA_EDGE_CODE_KEY_PREFIX");
  const lambdaEdgeRegion = getEnvOrThrow("LAMBDA_EDGE_REGION");


  const sourceStack = parseStackArn(event.StackId);
  const logicalResourceId = event.LogicalResourceId;
  const parameters = event.ResourceProperties.Parameters;
  const action = event.RequestType; // May be "Create" or "Update"


  const sourceArn = parameters.LambdaSourceArn;
  const source = parseLambdaArn(sourceArn);
  if (source.name === undefined) {
    throw new InvalidOperationError(
      `Parameter LambdaSourceArn "${sourceArn}" must be a valid Lambda ARN`
    );
  }


  // 1. Get Lambda source
  console.info(`Start getting source configuration "${sourceArn}"`);
  const lambda = new Lambda({ region: source.region });
  const originalLambda = await lambda.getFunction({
    FunctionName : source.name,
    Qualifier : source.version
  }).promise();
  console.info("Source configuration", originalLambda);


  // 2. Download source code as a ZIP buffer
  console.info(`Start downloading source code from "${originalLambda.Code.Location}"`);
  const codeUrl = url.parse(originalLambda.Code.Location);
  const codeFile = await new Promise((resolve, reject) => {
    const request = https.request({
      hostname : codeUrl.hostname,
      path : codeUrl.path,
      method : "GET"
    }, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks)));
    });
    request.on("error", reject);
    request.end();
  });


  // 3a. Upload source code to S3
  const codeUri = {
    region : lambdaEdgeRegion,
    bucket : lambdaEdgeCodeBucket,
    key : `${lambdaEdgeCodeKeyPrefix}${source.name}`
  };
  console.info("Start uploading source code to", codeUri);
  const s3 = new S3({ region: codeUri.region });
  const codeObject = await s3.putObject({
    Bucket : codeUri.bucket,
    Key : codeUri.key,
    Body : codeFile,
    // Mandatory for AWS Lambda to correctly decompress the file
    ContentType : "application/zip"
  }).promise();
  console.info("Source code uploaded to", codeObject);


  // 3b. Assertion
  codeUri.version = codeObject.VersionId;
  if (!codeUri.version) {
    throw new InvalidOperationError(
      `Object version is undefined. Make sure versioning is enabled on "${codeUri.bucket}" bucket`
    );
  }


  // 4. Deploy Lambda@Edge CloudFormation stack
  const stackName = `${sourceStack.name}-${logicalResourceId}`;
  const cfn = new CloudFormation({ region: lambdaEdgeRegion });

  // Suffix the Change Set name with epoch to make it unique
  const changeSetName = `${stackName}-${Date.now()}`;
  console.info("Create change set", changeSetName);

  const changeSet = await cfn.createChangeSet({
    StackName : stackName,
    ChangeSetName : changeSetName,
    Description : originalLambda.Configuration.Description
      || "Lambda@Edge deployed from a custom resource",
    Capabilities : ["CAPABILITY_IAM"],
    ChangeSetType : action.toUpperCase(), // May be "UPDATE" or "CREATE"
    TemplateBody : fs.readFileSync(
      path.join(__dirname, "cloudformation.yml"),
      "utf8"
    ),
    Parameters : [{
      ParameterKey : "FunctionDescription",
      ParameterValue : originalLambda.Configuration.Description
    }, {
      ParameterKey : "FunctionRuntime",
      ParameterValue : originalLambda.Configuration.Runtime
    }, {
      ParameterKey : "FunctionHandler",
      ParameterValue : originalLambda.Configuration.Handler
    }, {
      ParameterKey : "FunctionMemorySize",
      ParameterValue : originalLambda.Configuration.MemorySize.toString()
    }, {
      ParameterKey : "FunctionTimeout",
      ParameterValue : originalLambda.Configuration.Timeout.toString()
    }, {
      ParameterKey : "FunctionTracing",
      ParameterValue : originalLambda.Configuration.TracingConfig.Mode
    }, {
      ParameterKey : "FunctionRole",
      ParameterValue : parameters.LambdaRoleArn || ""
    }, {
      ParameterKey : "CodeUriBucket",
      ParameterValue : codeUri.bucket
    }, {
      ParameterKey : "CodeUriKey",
      ParameterValue : codeUri.key
    }, {
      ParameterKey : "CodeUriVersion",
      ParameterValue : codeUri.version
    }]
  }).promise();
  console.info("Change set created", changeSet);


  console.info("Wait for change set to complete", changeSetName);
  await cfn.waitFor("changeSetCreateComplete", {
    StackName : stackName,
    ChangeSetName : changeSetName
  }).promise();


  console.info("Execute change set", changeSetName);
  const changeSetExecution = await cfn.executeChangeSet({
    StackName : stackName,
    ChangeSetName : changeSetName
  }).promise();
  console.info("Change set executed", changeSetExecution);


  // May be "stackUpdateComplete" or "stackCreateComplete"
  const stateToWaitFor = `stack${action}Complete`;
  console.info("Wait for", stateToWaitFor, stackName);
  await cfn.waitFor(stateToWaitFor, {
    StackName : stackName
  }).promise();


  console.info("Get stack outputs", stackName);
  const describeResponse = await cfn.describeStacks({
    StackName : stackName
  }).promise();


  const description = describeResponse.Stacks[0];
  return description.Outputs.reduce((accu, item) => {
    accu[item.OutputKey] = item.OutputValue;
    return accu;
  }, {});
};
