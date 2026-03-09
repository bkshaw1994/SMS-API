const express = require("express");

function createSystemRoutes(controller, authenticateToken) {
  const router = express.Router();

  router.get("/health", controller.health);
  router.get("/db/health", controller.dbHealth);
  router.get("/tables", controller.tables);
  router.get("/roles", authenticateToken, controller.roles);
  router.get(
    "/superadmin/schools",
    authenticateToken,
    controller.superAdminSchools,
  );
  router.get(
    "/superadmin/schools/:schoolCode/students/classwise",
    authenticateToken,
    controller.superAdminStudentsClasswise,
  );
  router.get(
    "/superadmin/schools/:schoolCode/teachers",
    authenticateToken,
    controller.superAdminTeachers,
  );
  router.get(
    "/superadmin/schools/:schoolCode/parents",
    authenticateToken,
    controller.superAdminParents,
  );
  router.get(
    "/superadmin/schools/:schoolCode/owners-itadmin",
    authenticateToken,
    controller.superAdminOwnerAndItAdmin,
  );
  router.get("/itadmin/users", authenticateToken, controller.itAdminUsers);
  router.post("/school/validate-code", controller.validateSchoolCode);

  return router;
}

module.exports = {
  createSystemRoutes,
};
