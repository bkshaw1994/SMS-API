const express = require("express");

function createUserRoutes(controller, authenticateToken) {
  const router = express.Router();

  router.post("/users", authenticateToken, controller.addUser);

  return router;
}

module.exports = {
  createUserRoutes,
};
