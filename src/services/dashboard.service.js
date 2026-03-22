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

function isSchemaMismatchError(error) {
  const code = String(error?.code || "").trim();
  const message = String(error?.message || "").toLowerCase();

  if (code === "42P01" || code === "42703") {
    return true;
  }

  return (
    message.includes("does not exist") ||
    message.includes("undefined column") ||
    message.includes("undefined table")
  );
}

function buildDefaultOverviewByRole(role) {
  switch (role) {
    case "OWNER":
      return {
        totalStudents: 0,
        totalTeachers: 0,
        totalClasses: 0,
        totalRevenue: 0,
        pendingFees: 0,
        avgAttendance: 0,
        recentNotifications: [],
      };
    case "IT_ADMIN":
      return {
        totalUsers: 0,
        activeUsers: 0,
        recentUsers: [],
        systemAlerts: [],
        failedLogins: 0,
      };
    case "TEACHER":
      return {
        todaySchedule: [],
        totalClasses: 0,
        pendingAttendance: 0,
        assignmentsToReview: 0,
        notifications: [],
      };
    case "PARENT":
      return {
        childInfo: [],
        attendancePercentage: 0,
        recentResults: [],
        feeStatus: {
          totalFees: 0,
          paidFees: 0,
          pendingFees: 0,
          status: "NO_FEES",
        },
        notifications: [],
      };
    case "STUDENT":
      return {
        todayClasses: [],
        pendingAssignments: 0,
        attendancePercentage: 0,
        recentMarks: [],
        upcomingExams: [],
      };
    default:
      return {};
  }
}

/**
 * @param {{
 *   dashboardRepository: {
 *     getOwnerOverview: (args: { schoolId: string, schoolCode: string }) => Promise<Record<string, unknown>>,
 *     getItAdminOverview: (args: { schoolId: string, schoolCode: string }) => Promise<Record<string, unknown>>,
 *     getTeacherOverview: (args: { userId: string, schoolId: string, schoolCode: string }) => Promise<Record<string, unknown>>,
 *     getParentOverview: (args: { userId: string, schoolId: string, schoolCode: string }) => Promise<Record<string, unknown>>,
 *     getStudentOverview: (args: { userId: string, schoolId: string, schoolCode: string }) => Promise<Record<string, unknown>>,
 *   },
 * }} deps
 */
function createDashboardService({ dashboardRepository }) {
  const cache = new Map();
  const cacheTtlMs = 30000;

  function getCachedValue(cacheKey) {
    const entry = cache.get(cacheKey);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt < Date.now()) {
      cache.delete(cacheKey);
      return null;
    }

    return entry.value;
  }

  function setCachedValue(cacheKey, value) {
    cache.set(cacheKey, {
      value,
      expiresAt: Date.now() + cacheTtlMs,
    });
  }

  async function getDashboardOverview({ userId, role, schoolId, schoolCode }) {
    const normalizedRole = normalizeRole(role);
    const cacheKey = [userId, normalizedRole, schoolId || schoolCode].join(":");
    const cachedValue = getCachedValue(cacheKey);
    if (cachedValue) {
      return cachedValue;
    }

    let data;
    try {
      switch (normalizedRole) {
        case "OWNER":
          data = await dashboardRepository.getOwnerOverview({
            schoolId,
            schoolCode,
          });
          break;
        case "IT_ADMIN":
          data = await dashboardRepository.getItAdminOverview({
            schoolId,
            schoolCode,
          });
          break;
        case "TEACHER":
          data = await dashboardRepository.getTeacherOverview({
            userId,
            schoolId,
            schoolCode,
          });
          break;
        case "PARENT":
          data = await dashboardRepository.getParentOverview({
            userId,
            schoolId,
            schoolCode,
          });
          break;
        case "STUDENT":
          data = await dashboardRepository.getStudentOverview({
            userId,
            schoolId,
            schoolCode,
          });
          break;
        default: {
          const error = new Error("Forbidden");
          error.status = 403;
          error.details = `Role '${normalizedRole}' is not supported for dashboard overview`;
          throw error;
        }
      }
    } catch (error) {
      if (isSchemaMismatchError(error)) {
        data = buildDefaultOverviewByRole(normalizedRole);
      } else {
        throw error;
      }
    }

    setCachedValue(cacheKey, data);
    return data;
  }

  return {
    getDashboardOverview,
  };
}

module.exports = {
  createDashboardService,
};
