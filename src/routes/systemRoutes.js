const express = require("express");
const { createApiRateLimiter } = require("../middlewares/rateLimit");

function createSystemRoutes(controller, authenticateToken) {
  const router = express.Router();
  const apiRateLimiter = createApiRateLimiter();

  router.get("/health", controller.health);
  router.get("/db/health", apiRateLimiter, controller.dbHealth);
  router.get("/tables", apiRateLimiter, controller.tables);
  router.get("/roles", apiRateLimiter, authenticateToken, controller.roles);
  router.get(
    "/superadmin/schools",
    apiRateLimiter,
    authenticateToken,
    controller.superAdminSchools,
  );
  router.post(
    "/superadmin/schools",
    apiRateLimiter,
    authenticateToken,
    controller.superAdminAddSchool,
  );
  router.post(
    "/superadmin/schools/owner",
    apiRateLimiter,
    authenticateToken,
    controller.superAdminAddOwner,
  );
  router.get(
    "/superadmin/schools/:schoolCode/students/classwise",
    apiRateLimiter,
    authenticateToken,
    controller.superAdminStudentsClasswise,
  );
  router.get(
    "/superadmin/schools/:schoolCode/teachers",
    apiRateLimiter,
    authenticateToken,
    controller.superAdminTeachers,
  );
  router.get(
    "/superadmin/schools/:schoolCode/parents",
    apiRateLimiter,
    authenticateToken,
    controller.superAdminParents,
  );
  router.get(
    "/superadmin/schools/:schoolCode/owners-itadmin",
    apiRateLimiter,
    authenticateToken,
    controller.superAdminOwnerAndItAdmin,
  );
  router.get(
    "/itadmin/users",
    apiRateLimiter,
    authenticateToken,
    controller.itAdminUsers,
  );
  router.post(
    "/school/validate-code",
    apiRateLimiter,
    controller.validateSchoolCode,
  );

  return router;
}

module.exports = {
  createSystemRoutes,
};
