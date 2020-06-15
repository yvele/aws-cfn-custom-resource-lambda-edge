const getEnvOrThrow = require("./helpers/getEnvOrThrow");
const sendResponse = require("./helpers/customResource/sendResponse");
const deleteStack = require("./deleteStack");
const upsertStack = require("./upsertStack");


function handleCore(event) {
  if (event.ResourceType !== "Custom::LambdaEdge") {
    throw new Error(
      `Ressource type "${event.ResourceType}" is invalid, it should be "Custom::LambdaEdge"`
    );
  }

  const lambdaEdge = {
    codeBucket : getEnvOrThrow("LAMBDA_EDGE_CODE_BUCKET"),
    codeKeyPrefix : getEnvOrThrow("LAMBDA_EDGE_CODE_KEY_PREFIX"),
    region : getEnvOrThrow("LAMBDA_EDGE_REGION")
  };

  const action = event.RequestType;
  return action === "Create" || action === "Update"
    ? upsertStack(event, lambdaEdge)
    : deleteStack(event, lambdaEdge);
}


/**
 * Entry point of the Lambda handling the custom resource.
 *
 * @param {object} event
 * @param {string} event.RequestType [Create, Update, Delete]
 * @param {string} event.ResponseURL A presigned S3 bucket URL that receives responses
 * @param {string} event.StackId ARN of the stack that contains the custom resource
 * @param {string} event.RequestId A unique ID for the request
 * @param {string} event.ResourceType The template developer-chosen resource type of the custom resource
 * @param {string} event.LogicalResourceId The template developer-chosen name of the custom resource
 * @param {string=} event.PhysicalResourceId Never sent with Create request
 * @param {string} event.ResourceProperties Properties object sent by the template developer
 * @param {string} event.OldResourceProperties Used only for Update requests
 * @param {object} context
 */
exports.handle = async function handle(event, context) {
  console.log("Lambda:Event", event);

  let response;
  try {
    response = await handleCore(event, context);
  } catch (err) {
    console.error("Lambda:Error", err);
    return sendResponse(event, context, "FAILED", err);
  }

  console.log("Lambda:Response", response);
  return sendResponse(event, context, "SUCCESS", response);
};
