const express = require("express");

function createAuthRoutes(controller, authenticateToken) {
  const router = express.Router();

  router.post("/auth/validate-login", controller.validateLogin);
  router.post("/auth/logout", authenticateToken, controller.logout);

  return router;
}

module.exports = {
  createAuthRoutes,
};
