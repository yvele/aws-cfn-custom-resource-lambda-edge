const REGEX = /^arn:aws:lambda:([^:]*):([^:]*):function:([^:]*)(:([^:]+))?$/;

/**
 * @param {string} arn
 * @returns {object}
 */
module.exports = function parseLambdaArn(arn) {
  const match = arn && arn.match(REGEX);
  if (!match) {
    return {};
  }

  return {
    arn,
    region : match[1],
    account : match[2],
    name : match[3],
    version : match[5]
  };
};
