const express = require("express");
const { createApiRateLimiter } = require("../middlewares/rateLimit");

function createUserRoutes(controller, authenticateToken) {
  const router = express.Router();
  const apiRateLimiter = createApiRateLimiter();

  router.post("/users", apiRateLimiter, authenticateToken, controller.addUser);
  router.get(
    "/teacher/classes-assigned",
    apiRateLimiter,
    authenticateToken,
    controller.teacherAssignedClasses,
  );
  router.get(
    "/teacher/sections/:sectionId/students",
    apiRateLimiter,
    authenticateToken,
    controller.studentsBySection,
  );

  return router;
}

module.exports = {
  createUserRoutes,
};
