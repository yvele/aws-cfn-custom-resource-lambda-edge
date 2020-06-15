/**
 * Convert buffer to base64 string (required by AWS CloudFormation)
 *
 * NOTE: If we don't do that we get a template format error:
 * Every Value member must be a string
 *
 * @param {*} value
 * @returns {*}
 */
module.exports = function convertResponseData(value) {

  if (Buffer.isBuffer(value)) {
    return value.toString("base64");
  }

  if (Array.isArray(value)) {
    return value.map(item => convertResponseData(item));
  }

  if (typeof value === "object" && value !== null) {
    return Object.keys(value).reduce((accu, key) => {
      accu[key] = convertResponseData(value[key]);
      return accu;
    }, {});
  }

  return value;
};
