const express = require("express");
const { createAuthRateLimiter } = require("../middlewares/rateLimit");

function createAuthRoutes(controller, authenticateToken) {
  const router = express.Router();
  const authRateLimiter = createAuthRateLimiter();

  router.get("/auth/reset-password", controller.renderResetPasswordPage);
  router.post(
    "/auth/reset-password",
    authRateLimiter,
    controller.resetPassword,
  );
  router.post(
    "/auth/change-password",
    authRateLimiter,
    authenticateToken,
    controller.changePassword,
  );
  router.post(
    "/auth/forgot-password",
    authRateLimiter,
    controller.forgotPassword,
  );
  router.post(
    "/auth/forgot-password/verify",
    authRateLimiter,
    controller.forgotPasswordVerify,
  );
  router.post(
    "/auth/validate-login",
    authRateLimiter,
    controller.validateLogin,
  );
  router.post(
    "/auth/superadmin/login",
    authRateLimiter,
    controller.superAdminLogin,
  );
  router.post(
    "/auth/logout",
    authRateLimiter,
    authenticateToken,
    controller.logout,
  );

  return router;
}

module.exports = {
  createAuthRoutes,
};
