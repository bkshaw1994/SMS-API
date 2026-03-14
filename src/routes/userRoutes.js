const express = require("express");

function createUserRoutes(controller, authenticateToken) {
  const router = express.Router();

  router.post("/users", authenticateToken, controller.addUser);
  router.get(
    "/teacher/classes-assigned",
    authenticateToken,
    controller.teacherAssignedClasses,
  );
  router.get(
    "/teacher/sections/:sectionId/students",
    authenticateToken,
    controller.studentsBySection,
  );

  return router;
}

module.exports = {
  createUserRoutes,
};
