const { createHash } = require("crypto");


/**
 * Get the physical resource ID from a custom Cloudformation event.
 *
 * NOTE: Only "Create" action may have a physical resource ID build from StackId and RequestId.
 *
 * @param {object} event
 * @param {string} event.RequestType [Create, Update, Delete]
 * @param {string} event.StackId ARN of the stack that contains the custom resource
 * @param {string} event.RequestId A unique ID for the request
 * @param {string=} event.PhysicalResourceId Never sent with Create request
 * @returns {string}
 * @throws {Error} Physical resource ID not found in event for a delete or update action
 */
module.exports = function getPhysicalResourceId(event) {

  const pid = event.PhysicalResourceId;
  if (pid !== undefined && pid !== null) {
    return pid;
  }

  // Request types other than "Create" should already have a physical resource ID
  if (event.RequestType !== "Create") {
    throw new Error(
      `Physical resource ID should be set when action is "${event.RequestType}"`
    );
  }

  // Combining the StackId with the RequestId forms a value
  // that you can use to uniquely identify a request on a particular custom resource.
  return createHash("sha256")
    .update(`${event.StackId}${event.RequestId}`)
    .digest("base64");
};
