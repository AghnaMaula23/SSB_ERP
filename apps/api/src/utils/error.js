/**
 * Bikin Error dengan HTTP status code, dibaca oleh middleware/error.js
 *   throw httpError('Role tidak ditemukan', 404);
 */
const httpError = (message, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });

module.exports = { httpError };
