const express = require("express");
const { createApiRateLimiter } = require("../middlewares/rateLimit");

/**
 * @param {{ getDashboardOverview: import("express").RequestHandler }} controller
 * @param {import("express").RequestHandler} dashboardAuthMiddleware
 * @returns {import("express").Router}
 */
function createDashboardRoutes(controller, dashboardAuthMiddleware) {
  const router = express.Router();
  const apiRateLimiter = createApiRateLimiter();

  router.get(
    "/dashboard/overview",
    apiRateLimiter,
    dashboardAuthMiddleware,
    controller.getDashboardOverview,
  );

  return router;
}

module.exports = {
  createDashboardRoutes,
};
