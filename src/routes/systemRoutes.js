const express = require("express");

function createSystemRoutes(controller, authenticateToken) {
  const router = express.Router();

  router.get("/health", controller.health);
  router.get("/db/health", controller.dbHealth);
  router.get("/tables", controller.tables);
  router.get("/roles", authenticateToken, controller.roles);
  router.get("/itadmin/users", authenticateToken, controller.itAdminUsers);
  router.post("/school/validate-code", controller.validateSchoolCode);

  return router;
}

module.exports = {
  createSystemRoutes,
};
