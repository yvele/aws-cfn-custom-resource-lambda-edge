const https = require("https");
const url = require("url");


/**
 * Send custom resource response back to CloudFormation,
 * using an HTTPS PUT request on an S3 pre-signed URL.
 *
 * This function is an async/await adapatation from the code found on AWS documentation
 * https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cfn-lambda-function-code-cfnresponsemodule.html
 *
 * @see https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cfn-lambda-function-code-cfnresponsemodule.html
 * @see https://github.com/LukeMizuhashi/cfn-response
 * @param {object} event
 * @param {string} event.StackId
 * @param {string} event.RequestId
 * @param {string} event.LogicalResourceId
 * @param {string} event.ResponseURL
 * @param {object} context
 * @param {string} context.logStreamName
 * @param {string} status Response status of the CloudFormation custom resource
 * that can either be "SUCCESS" or "FAILED"
 * @param {object} data Response data of the CloudFormation custom resource
 * @param {string=} physicalResourceId
 */
module.exports = async function sendCore(event, context, status, data, physicalResourceId) {
  if (!event) {
    throw new Error("event is null or undefined");
  }
  if (!context) {
    throw new Error("context is null or undefined");
  }
  if (!["SUCCESS", "FAILED"].includes(status)) {
    throw new Error('status must either be "SUCCESS" or "FAILED"');
  }

  const { logStreamName } = context;
  const bodyObject = {
    Status : status,
    Reason : `See the details in CloudWatch Log Stream: ${logStreamName}`,
    PhysicalResourceId : physicalResourceId || logStreamName,
    StackId : event.StackId,
    RequestId : event.RequestId,
    LogicalResourceId : event.LogicalResourceId,
    NoEcho : false,
    Data : data
  };

  const body = JSON.stringify(bodyObject);
  const parsedUrl = url.parse(event.ResponseURL);
  const requestOptions = {
    hostname : parsedUrl.hostname,
    path : parsedUrl.path,
    port : 443,
    method : "PUT",
    headers : {
      "content-type" : "",
      "content-length" : body.length
    }
  };

  console.info("HTTPS request", { ...requestOptions, body: bodyObject });
  return new Promise((resolve, reject) => {
    const request = https.request(requestOptions, response => {
      console.info(`HTTPS response with status ${response.statusCode} ${response.statusMessage}`);
      resolve();
    });
    request.on("error", err => {
      console.error(err);
      reject(err);
    });
    request.write(body);
    request.end();
  });
};
