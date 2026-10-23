const { rateLimit } = require("express-rate-limit");

const createLimiter = (limit, message) => rateLimit({
  windowMs: 15 * 60 * 1000,
  limit,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: message },
});

const apiLimiter = createLimiter(180, "Too many requests. Please try again later.");
const authLimiter = createLimiter(10, "Too many authentication attempts. Please try again later.");
const expensiveLimiter = createLimiter(5, "Usage limit reached. Please try again later.");

module.exports = { apiLimiter, authLimiter, expensiveLimiter };
