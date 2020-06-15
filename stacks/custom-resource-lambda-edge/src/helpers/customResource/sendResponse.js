const sendCore = require("./sendCore");
const getPhysicalResourceId = require("./getPhysicalResourceId");
const convertResponseData = require("./convertResponseData");

/**
 * Send custom resource response back to CloudFormation,
 * using an HTTPS PUT request on an S3 pre-signed URL.
 *
 * @param {object} event Lambda event
 * @param {object} context Lambda context
 * @param {string} status Response status of the CloudFormation custom resource
 * that can either be "SUCCESS" or "FAILED"
 * @param {object} data Response data of the CloudFormation custom resource
 * @returns {object} Lambda sucess response
 */
module.exports = async function sendResponse(event, context, status, data) {
  await sendCore(
    event,
    context,
    status,
    status === "FAILED" ? data : convertResponseData(data),
    getPhysicalResourceId(event)
  );

  // Using async/wait the Lambda still must return a valid Lambda reponse
  // otherwise we get an "aws lambda Error: Unable to stringify response body" error
  return { success: true };
};
