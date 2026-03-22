/**
 * @param {{
 *   dashboardService: {
 *     getDashboardOverview: (args: {
 *       userId: string,
 *       role: string,
 *       schoolId: string,
 *       schoolCode: string,
 *     }) => Promise<Record<string, unknown>>,
 *   },
 *   buildDbError: (error: Error, operation: string) => Record<string, unknown>,
 * }} deps
 */
function createDashboardController({ dashboardService, buildDbError }) {
  async function getDashboardOverview(req, res) {
    const userId = String(req.dashboardAuth?.userId || "").trim();
    const role = String(req.dashboardAuth?.role || "").trim();
    const schoolId = String(req.dashboardAuth?.schoolId || "").trim();
    const schoolCode = String(req.dashboardAuth?.schoolCode || "").trim();

    if (!userId || !role || (!schoolId && !schoolCode)) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
        details: "Authenticated dashboard context is incomplete",
      });
    }

    try {
      const data = await dashboardService.getDashboardOverview({
        userId,
        role,
        schoolId,
        schoolCode,
      });

      return res.status(200).json({
        success: true,
        role,
        data,
      });
    } catch (error) {
      if (error && typeof error.status === "number") {
        return res.status(error.status).json({
          success: false,
          error: error.message || "Failed to fetch dashboard overview",
          ...(error.details ? { details: error.details } : {}),
        });
      }

      return res.status(500).json({
        success: false,
        ...buildDbError(error, "Failed to fetch dashboard overview"),
      });
    }
  }

  return {
    getDashboardOverview,
  };
}

module.exports = {
  createDashboardController,
};
