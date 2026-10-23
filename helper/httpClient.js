const axios = require("axios");

// Shared limits for calls to fixed third-party APIs. Requests are not retried
// automatically so provider failures cannot multiply cost or load.
module.exports = axios.create({
  timeout: 15000,
  maxRedirects: 2,
  maxContentLength: 5 * 1024 * 1024,
  maxBodyLength: 1 * 1024 * 1024,
});
