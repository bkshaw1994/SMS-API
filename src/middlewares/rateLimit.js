const rateLimit = require("express-rate-limit");

function createAuthRateLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: "Too many requests",
      details: "Please try again later",
    },
  });
}

function createApiRateLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: "Too many requests",
      details: "Please try again later",
    },
  });
}

module.exports = {
  createAuthRateLimiter,
  createApiRateLimiter,
};
