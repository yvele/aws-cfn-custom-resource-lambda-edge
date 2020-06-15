/**
 * Get an environment variable value or throw an error.
 *
 * @param {string} key The environment variable key
 * @returns {string} The environment variable value
 * @throws {Error} Environment variable has not been found
 */
module.exports = function getEnvOrThrow(key) {
  if (key === null || key === undefined) {
    throw new Error("key is null or undefined");
  }

  const value = process.env[key];
  if (value === null || value === undefined) {
    throw new Error(
      `Environment variable "${key}" is null or undefined`
    );
  }
  return value;
};
