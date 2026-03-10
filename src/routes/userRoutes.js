const express = require("express");
const rateLimit = require("express-rate-limit");

function createUserRoutes(controller, authenticateToken) {
  const router = express.Router();

  const createUserLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 user-creation requests per window
  });

  router.post("/users", createUserLimiter, authenticateToken, controller.addUser);

  return router;
}

module.exports = {
  createUserRoutes,
};
