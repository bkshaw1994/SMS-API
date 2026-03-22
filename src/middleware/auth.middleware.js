const jwt = require("jsonwebtoken");

const DASHBOARD_ROLES = new Set([
  "OWNER",
  "IT_ADMIN",
  "TEACHER",
  "PARENT",
  "STUDENT",
]);

function normalizeRole(role) {
  const normalizedRole = String(role || "")
    .trim()
    .toUpperCase()
    .replace(/[-\s]+/g, "_");

  if (normalizedRole === "ITADMIN") {
    return "IT_ADMIN";
  }

  return normalizedRole;
}

/**
 * Creates dashboard-specific JWT middleware that also resolves school context.
 *
 * @param {{
 *   jwtSecret: string,
 *   dashboardRepository: {
 *     resolveSchoolContext: (args: {
 *       userId: string,
 *       schoolId: string,
 *       schoolCode: string,
 *     }) => Promise<{ schoolId: string, schoolCode: string }>,
 *   },
 * }} params
 * @returns {import("express").RequestHandler}
 */
function createDashboardAuthMiddleware({ jwtSecret, dashboardRepository }) {
  return async function dashboardAuthMiddleware(req, res, next) {
    const authorization = req.headers.authorization || "";
    if (!authorization.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
        details: "Missing Bearer token in Authorization header",
      });
    }

    const token = authorization.slice("Bearer ".length).trim();

    try {
      const claims = jwt.verify(token, jwtSecret);
      const userId = String(
        claims?.userId || claims?.user_id || claims?.sub || "",
      ).trim();
      const role = normalizeRole(claims?.role || claims?.user_role);
      const schoolId = String(
        claims?.schoolId || claims?.school_id || "",
      ).trim();
      const schoolCode = String(
        claims?.schoolCode || claims?.school_code || "",
      ).trim();

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: "Unauthorized",
          details: "Token does not contain userId",
        });
      }

      if (!DASHBOARD_ROLES.has(role)) {
        return res.status(403).json({
          success: false,
          error: "Forbidden",
          details: "Role is not allowed to access dashboard overview",
        });
      }

      const schoolContext = await dashboardRepository.resolveSchoolContext({
        userId,
        schoolId,
        schoolCode,
      });

      if (!schoolContext.schoolId && !schoolContext.schoolCode) {
        return res.status(401).json({
          success: false,
          error: "Unauthorized",
          details:
            "Unable to resolve school context for the authenticated user",
        });
      }

      req.user = {
        ...claims,
        userId,
        role,
        schoolId: schoolContext.schoolId,
        schoolCode: schoolContext.schoolCode,
      };

      req.dashboardAuth = {
        userId,
        role,
        schoolId: schoolContext.schoolId,
        schoolCode: schoolContext.schoolCode,
      };

      return next();
    } catch {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
        details: "Invalid or expired token",
      });
    }
  };
}

module.exports = {
  createDashboardAuthMiddleware,
};
