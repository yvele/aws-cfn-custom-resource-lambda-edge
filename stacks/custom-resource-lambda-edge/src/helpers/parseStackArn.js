const REGEX = /^arn:aws:cloudformation:(.*):(.*):stack\/(.*)\/(.*)$/;

/**
 * @param {string} arn
 * @returns {object}
 */
module.exports = function parseStackArn(arn) {
  const match = arn && arn.match(REGEX);
  if (!match) {
    return {};
  }

  return {
    arn,
    region : match[1],
    account : match[2],
    name : match[3],
    id : match[4]
  };
};
