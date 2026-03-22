function createNotFoundError(message, details) {
  const error = new Error(message);
  error.status = 404;
  error.details = details;
  return error;
}

function quoteIdentifier(identifier) {
  return `"${identifier}"`;
}

function normalizeNotification(row) {
  return {
    id: row.notification_id || row.id || null,
    title: row.title || row.subject || null,
    message: row.message || row.description || "",
    type: row.type || row.category || row.severity || null,
    createdAt: row.created_at || row.updated_at || row.date || null,
  };
}

function normalizeResult(row) {
  return {
    id: row.result_id || row.id || null,
    examId: row.exam_id || null,
    studentId: row.student_id || null,
    subject: row.subject || row.subject_name || null,
    marks: row.marks || row.score || null,
    grade: row.grade || null,
    publishedAt: row.created_at || row.published_at || row.exam_date || null,
  };
}

/**
 * @param {{
 *   pool: import("pg").Pool,
 *   findFirstExistingColumn: (pool: import("pg").Pool, table: string, candidates: string[]) => Promise<string | null>,
 * }} deps
 */
function createDashboardRepository({ pool, findFirstExistingColumn }) {
  const columnCache = new Map();
  const tableCache = new Map();

  async function findFirstExistingTable(tableCandidates) {
    const cacheKey = tableCandidates.join(",");
    if (tableCache.has(cacheKey)) {
      return tableCache.get(cacheKey);
    }

    const result = await pool.query(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ANY($1)
        ORDER BY array_position($1::text[], table_name)
        LIMIT 1;
      `,
      [tableCandidates],
    );

    const tableName = result.rowCount > 0 ? result.rows[0].table_name : null;
    tableCache.set(cacheKey, tableName);
    return tableName;
  }

  async function getColumn(tableName, candidates) {
    const cacheKey = `${tableName}:${candidates.join(",")}`;
    if (columnCache.has(cacheKey)) {
      return columnCache.get(cacheKey);
    }

    const columnName = await findFirstExistingColumn(
      pool,
      tableName,
      candidates,
    );
    columnCache.set(cacheKey, columnName);
    return columnName;
  }

  async function resolveSchoolContext({ userId, schoolId, schoolCode }) {
    let resolvedSchoolId = String(schoolId || "").trim();
    let resolvedSchoolCode = String(schoolCode || "").trim();

    const schoolPkColumn = await getColumn("school", ["school_id", "id"]);
    const schoolCodeColumn = await getColumn("school", [
      "school_code",
      "schoolcode",
      "code",
    ]);

    if (!resolvedSchoolId && !resolvedSchoolCode) {
      const userPkColumn = await getColumn("users", ["user_id", "id"]);
      const userSchoolIdColumn = await getColumn("users", [
        "school_id",
        "schoolid",
      ]);
      const userSchoolCodeColumn = await getColumn("users", [
        "school_code",
        "schoolcode",
        "code",
      ]);

      if (userPkColumn && (userSchoolIdColumn || userSchoolCodeColumn)) {
        const selectColumns = [];
        if (userSchoolIdColumn) {
          selectColumns.push(
            `${quoteIdentifier(userSchoolIdColumn)}::text AS school_id_value`,
          );
        }
        if (userSchoolCodeColumn) {
          selectColumns.push(
            `${quoteIdentifier(userSchoolCodeColumn)}::text AS school_code_value`,
          );
        }

        const userResult = await pool.query(
          `
            SELECT ${selectColumns.join(", ")}
            FROM "users"
            WHERE ${quoteIdentifier(userPkColumn)}::text = $1::text
            LIMIT 1;
          `,
          [userId],
        );

        if (userResult.rowCount > 0) {
          resolvedSchoolId =
            userResult.rows[0].school_id_value || resolvedSchoolId;
          resolvedSchoolCode =
            userResult.rows[0].school_code_value || resolvedSchoolCode;
        }
      }
    }

    if (schoolPkColumn && resolvedSchoolId) {
      const schoolResult = await pool.query(
        `
          SELECT
            ${quoteIdentifier(schoolPkColumn)}::text AS school_id,
            ${schoolCodeColumn ? `${quoteIdentifier(schoolCodeColumn)}::text` : `NULL::text`} AS school_code
          FROM "school"
          WHERE ${quoteIdentifier(schoolPkColumn)}::text = $1::text
          LIMIT 1;
        `,
        [resolvedSchoolId],
      );

      if (schoolResult.rowCount > 0) {
        return {
          schoolId: schoolResult.rows[0].school_id || resolvedSchoolId,
          schoolCode: schoolResult.rows[0].school_code || resolvedSchoolCode,
        };
      }
    }

    if (schoolCodeColumn && resolvedSchoolCode) {
      const schoolResult = await pool.query(
        `
          SELECT
            ${schoolPkColumn ? `${quoteIdentifier(schoolPkColumn)}::text` : `NULL::text`} AS school_id,
            ${quoteIdentifier(schoolCodeColumn)}::text AS school_code
          FROM "school"
          WHERE LOWER(${quoteIdentifier(schoolCodeColumn)}::text) = LOWER($1)
          LIMIT 1;
        `,
        [resolvedSchoolCode],
      );

      if (schoolResult.rowCount > 0) {
        return {
          schoolId: schoolResult.rows[0].school_id || resolvedSchoolId,
          schoolCode: schoolResult.rows[0].school_code || resolvedSchoolCode,
        };
      }
    }

    return {
      schoolId: resolvedSchoolId,
      schoolCode: resolvedSchoolCode,
    };
  }

  async function buildSchoolFilter(
    tableName,
    alias,
    schoolId,
    schoolCode,
    startIndex = 1,
  ) {
    const tableAlias = alias ? `${alias}.` : "";
    const schoolIdColumn = await getColumn(tableName, [
      "school_id",
      "schoolid",
    ]);
    if (schoolIdColumn && schoolId) {
      return {
        clause: `${tableAlias}${quoteIdentifier(schoolIdColumn)}::text = $${startIndex}::text`,
        params: [schoolId],
        nextIndex: startIndex + 1,
      };
    }

    const schoolCodeColumn = await getColumn(tableName, [
      "school_code",
      "schoolcode",
      "code",
    ]);
    if (schoolCodeColumn && schoolCode) {
      return {
        clause: `LOWER(${tableAlias}${quoteIdentifier(schoolCodeColumn)}::text) = LOWER($${startIndex})`,
        params: [schoolCode],
        nextIndex: startIndex + 1,
      };
    }

    return {
      clause: "1 = 1",
      params: [],
      nextIndex: startIndex,
    };
  }

  async function countBySchool(tableName, schoolId, schoolCode) {
    const schoolFilter = await buildSchoolFilter(
      tableName,
      "",
      schoolId,
      schoolCode,
    );

    const result = await pool.query(
      `
        SELECT COUNT(*)::int AS total
        FROM ${quoteIdentifier(tableName)}
        WHERE ${schoolFilter.clause};
      `,
      schoolFilter.params,
    );

    return result.rows[0]?.total || 0;
  }

  async function listRecentNotifications(schoolId, schoolCode, limit = 5) {
    const notificationsTable = await findFirstExistingTable([
      "notifications",
      "notification",
      "alerts",
    ]);

    if (!notificationsTable) {
      return [];
    }

    const schoolFilter = await buildSchoolFilter(
      notificationsTable,
      "",
      schoolId,
      schoolCode,
    );
    const createdAtColumn =
      (await getColumn(notificationsTable, [
        "created_at",
        "updated_at",
        "date",
      ])) || "created_at";
    const notificationIdColumn = await getColumn(notificationsTable, [
      "notification_id",
      "id",
    ]);
    const titleColumn = await getColumn(notificationsTable, [
      "title",
      "subject",
    ]);
    const messageColumn =
      (await getColumn(notificationsTable, ["message", "description"])) ||
      "message";
    const typeColumn = await getColumn(notificationsTable, [
      "type",
      "category",
      "severity",
    ]);

    const result = await pool.query(
      `
        SELECT
          ${notificationIdColumn ? `${quoteIdentifier(notificationIdColumn)}::text` : `NULL::text`} AS notification_id,
          ${titleColumn ? `${quoteIdentifier(titleColumn)}::text` : `NULL::text`} AS title,
          ${quoteIdentifier(messageColumn)}::text AS message,
          ${typeColumn ? `${quoteIdentifier(typeColumn)}::text` : `NULL::text`} AS type,
          ${quoteIdentifier(createdAtColumn)} AS created_at
        FROM ${quoteIdentifier(notificationsTable)}
        WHERE ${schoolFilter.clause}
        ORDER BY ${quoteIdentifier(createdAtColumn)} DESC NULLS LAST
        LIMIT ${Number(limit)};
      `,
      schoolFilter.params,
    );

    return result.rows.map(normalizeNotification);
  }

  async function getAttendancePercentage(
    schoolId,
    schoolCode,
    studentIds = [],
  ) {
    const schoolFilter = await buildSchoolFilter(
      "attendance",
      "",
      schoolId,
      schoolCode,
    );
    const statusColumn = await getColumn("attendance", [
      "status",
      "attendance_status",
    ]);
    const presentColumn = await getColumn("attendance", [
      "is_present",
      "present",
    ]);
    const studentIdColumn = await getColumn("attendance", [
      "student_id",
      "studentid",
    ]);

    const params = [...schoolFilter.params];
    const whereClauses = [schoolFilter.clause];

    if (studentIds.length > 0 && studentIdColumn) {
      params.push(studentIds);
      whereClauses.push(
        `${quoteIdentifier(studentIdColumn)}::text = ANY($${params.length}::text[])`,
      );
    }

    const totalResult = await pool.query(
      `
        SELECT COUNT(*)::int AS total
        FROM "attendance"
        WHERE ${whereClauses.join(" AND ")};
      `,
      params,
    );

    const totalCount = totalResult.rows[0]?.total || 0;
    if (totalCount === 0) {
      return 0;
    }

    let presentCount = 0;
    if (presentColumn) {
      const presentResult = await pool.query(
        `
          SELECT COUNT(*)::int AS total
          FROM "attendance"
          WHERE ${whereClauses.join(" AND ")}
            AND ${quoteIdentifier(presentColumn)} = TRUE;
        `,
        params,
      );
      presentCount = presentResult.rows[0]?.total || 0;
    } else if (statusColumn) {
      const presentResult = await pool.query(
        `
          SELECT COUNT(*)::int AS total
          FROM "attendance"
          WHERE ${whereClauses.join(" AND ")}
            AND LOWER(${quoteIdentifier(statusColumn)}::text) = 'present';
        `,
        params,
      );
      presentCount = presentResult.rows[0]?.total || 0;
    }

    return Number(((presentCount / totalCount) * 100).toFixed(2));
  }

  async function sumFees(schoolId, schoolCode, studentIds = []) {
    const schoolFilter = await buildSchoolFilter(
      "fees",
      "",
      schoolId,
      schoolCode,
    );
    const amountColumn = await getColumn("fees", [
      "amount",
      "total_amount",
      "fee_amount",
    ]);
    const paidAmountColumn = await getColumn("fees", [
      "paid_amount",
      "amount_paid",
      "paid",
    ]);
    const balanceColumn = await getColumn("fees", [
      "balance_due",
      "pending_amount",
      "due_amount",
    ]);
    const studentIdColumn = await getColumn("fees", [
      "student_id",
      "studentid",
    ]);

    const params = [...schoolFilter.params];
    const whereClauses = [schoolFilter.clause];
    if (studentIds.length > 0 && studentIdColumn) {
      params.push(studentIds);
      whereClauses.push(
        `${quoteIdentifier(studentIdColumn)}::text = ANY($${params.length}::text[])`,
      );
    }

    const result = await pool.query(
      `
        SELECT
          ${amountColumn ? `COALESCE(SUM(${quoteIdentifier(amountColumn)}), 0)` : `0`}::numeric AS total_fees,
          ${paidAmountColumn ? `COALESCE(SUM(${quoteIdentifier(paidAmountColumn)}), 0)` : `0`}::numeric AS paid_fees,
          ${balanceColumn ? `COALESCE(SUM(${quoteIdentifier(balanceColumn)}), 0)` : `0`}::numeric AS pending_fees
        FROM "fees"
        WHERE ${whereClauses.join(" AND ")};
      `,
      params,
    );

    const totalFees = Number(result.rows[0]?.total_fees || 0);
    const paidFees = Number(result.rows[0]?.paid_fees || 0);
    const pendingFees = balanceColumn
      ? Number(result.rows[0]?.pending_fees || 0)
      : Math.max(totalFees - paidFees, 0);

    return {
      totalFees,
      paidFees,
      pendingFees,
    };
  }

  async function resolveTeacherId(userId) {
    const teacherIdColumn = await getColumn("teachers", ["teacher_id", "id"]);
    const teacherUserIdColumn = await getColumn("teachers", [
      "user_id",
      "userid",
    ]);

    if (!teacherIdColumn || !teacherUserIdColumn) {
      return "";
    }

    const result = await pool.query(
      `
        SELECT ${quoteIdentifier(teacherIdColumn)}::text AS teacher_id
        FROM "teachers"
        WHERE ${quoteIdentifier(teacherUserIdColumn)}::text = $1::text
        LIMIT 1;
      `,
      [userId],
    );

    return result.rows[0]?.teacher_id || "";
  }

  async function resolveStudentRecord(userId, schoolId, schoolCode) {
    const studentIdColumn = await getColumn("students", ["student_id", "id"]);
    const studentUserIdColumn = await getColumn("students", [
      "user_id",
      "student_user_id",
      "userid",
    ]);
    const classIdColumn = await getColumn("students", ["class_id", "classid"]);
    const sectionIdColumn = await getColumn("students", [
      "section_id",
      "sectionid",
    ]);

    if (!studentIdColumn || !studentUserIdColumn) {
      return null;
    }

    const schoolFilter = await buildSchoolFilter(
      "students",
      "",
      schoolId,
      schoolCode,
      2,
    );

    const result = await pool.query(
      `
        SELECT
          ${quoteIdentifier(studentIdColumn)}::text AS student_id,
          ${classIdColumn ? `${quoteIdentifier(classIdColumn)}::text` : `NULL::text`} AS class_id,
          ${sectionIdColumn ? `${quoteIdentifier(sectionIdColumn)}::text` : `NULL::text`} AS section_id
        FROM "students"
        WHERE ${quoteIdentifier(studentUserIdColumn)}::text = $1::text
          AND ${schoolFilter.clause}
        LIMIT 1;
      `,
      [userId, ...schoolFilter.params],
    );

    return result.rows[0] || null;
  }

  async function getOwnerOverview({ schoolId, schoolCode }) {
    const [
      totalStudents,
      totalTeachers,
      totalClasses,
      feeSummary,
      avgAttendance,
      recentNotifications,
    ] = await Promise.all([
      countBySchool("students", schoolId, schoolCode),
      countBySchool("teachers", schoolId, schoolCode),
      countBySchool("classes", schoolId, schoolCode),
      sumFees(schoolId, schoolCode),
      getAttendancePercentage(schoolId, schoolCode),
      listRecentNotifications(schoolId, schoolCode, 5),
    ]);

    return {
      totalStudents,
      totalTeachers,
      totalClasses,
      totalRevenue: feeSummary.paidFees,
      pendingFees: feeSummary.pendingFees,
      avgAttendance,
      recentNotifications,
    };
  }

  async function getItAdminOverview({ schoolId, schoolCode }) {
    const schoolFilter = await buildSchoolFilter(
      "users",
      "",
      schoolId,
      schoolCode,
    );
    const statusColumn = await getColumn("users", ["status"]);
    const isActiveColumn = await getColumn("users", ["is_active", "active"]);
    const userIdColumn = await getColumn("users", ["user_id", "id"]);
    const nameColumn = await getColumn("users", [
      "full_name",
      "name",
      "user_name",
    ]);
    const createdAtColumn =
      (await getColumn("users", ["created_at", "updated_at"])) || "created_at";
    const failedLoginsColumn = await getColumn("users", [
      "failed_login_attempts",
      "failed_logins",
    ]);

    const [
      totalUsersResult,
      activeUsersResult,
      recentUsersResult,
      notifications,
    ] = await Promise.all([
      pool.query(
        `
            SELECT COUNT(*)::int AS total
            FROM "users"
            WHERE ${schoolFilter.clause};
          `,
        schoolFilter.params,
      ),
      statusColumn
        ? pool.query(
            `
                SELECT COUNT(*)::int AS total
                FROM "users"
                WHERE ${schoolFilter.clause}
                  AND UPPER(${quoteIdentifier(statusColumn)}::text) = 'ACTIVE';
              `,
            schoolFilter.params,
          )
        : isActiveColumn
          ? pool.query(
              `
                  SELECT COUNT(*)::int AS total
                  FROM "users"
                  WHERE ${schoolFilter.clause}
                    AND ${quoteIdentifier(isActiveColumn)} = TRUE;
                `,
              schoolFilter.params,
            )
          : Promise.resolve({ rows: [{ total: 0 }] }),
      pool.query(
        `
            SELECT
              ${userIdColumn ? `${quoteIdentifier(userIdColumn)}::text` : `NULL::text`} AS user_id,
              ${nameColumn ? `${quoteIdentifier(nameColumn)}::text` : `NULL::text`} AS name,
              email::text AS email,
              ${statusColumn ? `${quoteIdentifier(statusColumn)}::text` : `NULL::text`} AS status,
              ${quoteIdentifier(createdAtColumn)} AS created_at
            FROM "users"
            WHERE ${schoolFilter.clause}
            ORDER BY ${quoteIdentifier(createdAtColumn)} DESC NULLS LAST
            LIMIT 5;
          `,
        schoolFilter.params,
      ),
      listRecentNotifications(schoolId, schoolCode, 5),
    ]);

    let failedLogins = 0;
    if (failedLoginsColumn) {
      const failedLoginsResult = await pool.query(
        `
          SELECT COALESCE(SUM(${quoteIdentifier(failedLoginsColumn)}), 0)::int AS total
          FROM "users"
          WHERE ${schoolFilter.clause};
        `,
        schoolFilter.params,
      );
      failedLogins = failedLoginsResult.rows[0]?.total || 0;
    }

    return {
      totalUsers: totalUsersResult.rows[0]?.total || 0,
      activeUsers: activeUsersResult.rows[0]?.total || 0,
      recentUsers: recentUsersResult.rows.map((row) => ({
        id: row.user_id || null,
        name: row.name || null,
        email: row.email || null,
        status: row.status || null,
        createdAt: row.created_at || null,
      })),
      systemAlerts: notifications,
      failedLogins,
    };
  }

  async function getTeacherOverview({ userId, schoolId, schoolCode }) {
    const teacherId = await resolveTeacherId(userId);
    if (!teacherId) {
      throw createNotFoundError(
        "Teacher not found",
        "No teacher record found for authenticated user",
      );
    }

    const sectionTeacherIdColumn = await getColumn("sections", [
      "teacher_id",
      "teacherid",
    ]);
    const sectionIdColumn = await getColumn("sections", ["section_id", "id"]);
    const sectionNameColumn = await getColumn("sections", [
      "section_name",
      "name",
    ]);
    const sectionStartColumn = await getColumn("sections", ["start_time"]);
    const sectionEndColumn = await getColumn("sections", ["end_time"]);
    const sectionSubjectColumn = await getColumn("sections", [
      "subject",
      "subject_name",
    ]);
    const classIdColumn = await getColumn("sections", ["class_id", "classid"]);
    const classesPkColumn = await getColumn("classes", ["class_id", "id"]);
    const classesNameColumn = await getColumn("classes", [
      "class_name",
      "name",
      "title",
    ]);
    const schoolFilter = await buildSchoolFilter(
      "sections",
      "s",
      schoolId,
      schoolCode,
      2,
    );

    const todayScheduleResult = sectionTeacherIdColumn
      ? await pool.query(
          `
            SELECT
              ${sectionIdColumn ? `s.${quoteIdentifier(sectionIdColumn)}::text` : `NULL::text`} AS id,
              ${classesNameColumn && classIdColumn && classesPkColumn ? `c.${quoteIdentifier(classesNameColumn)}::text` : `s.${quoteIdentifier(sectionNameColumn || sectionIdColumn || "id")}::text`} AS class_name,
              ${sectionSubjectColumn ? `s.${quoteIdentifier(sectionSubjectColumn)}::text` : `NULL::text`} AS subject,
              ${sectionStartColumn ? `s.${quoteIdentifier(sectionStartColumn)}` : `NULL`} AS start_time,
              ${sectionEndColumn ? `s.${quoteIdentifier(sectionEndColumn)}` : `NULL`} AS end_time,
              ${sectionNameColumn ? `s.${quoteIdentifier(sectionNameColumn)}::text` : `NULL::text`} AS room
            FROM "sections" s
            ${classIdColumn && classesPkColumn ? `LEFT JOIN "classes" c ON c.${quoteIdentifier(classesPkColumn)}::text = s.${quoteIdentifier(classIdColumn)}::text` : ""}
            WHERE s.${quoteIdentifier(sectionTeacherIdColumn)}::text = $1::text
              AND ${schoolFilter.clause}
            ORDER BY ${sectionStartColumn ? `s.${quoteIdentifier(sectionStartColumn)} ASC NULLS LAST` : `s.${quoteIdentifier(sectionIdColumn || "id")} DESC`}
            LIMIT 5;
          `,
          [teacherId, ...schoolFilter.params],
        )
      : { rows: [] };

    const attendanceSectionColumn = await getColumn("attendance", [
      "section_id",
      "sectionid",
    ]);
    const attendanceDateColumn = await getColumn("attendance", [
      "attendance_date",
      "date",
      "created_at",
    ]);
    const todayString = new Date().toISOString().slice(0, 10);

    let pendingAttendance = 0;
    if (
      attendanceSectionColumn &&
      attendanceDateColumn &&
      todayScheduleResult.rows.length > 0
    ) {
      const sectionIds = todayScheduleResult.rows
        .map((row) => row.id)
        .filter((value) => Boolean(value));
      const attendanceResult = await pool.query(
        `
          SELECT COUNT(DISTINCT ${quoteIdentifier(attendanceSectionColumn)}::text)::int AS total
          FROM "attendance"
          WHERE ${quoteIdentifier(attendanceSectionColumn)}::text = ANY($1::text[])
            AND DATE(${quoteIdentifier(attendanceDateColumn)}) = $2::date;
        `,
        [sectionIds, todayString],
      );
      pendingAttendance = Math.max(
        todayScheduleResult.rows.length -
          (attendanceResult.rows[0]?.total || 0),
        0,
      );
    }

    return {
      todaySchedule: todayScheduleResult.rows.map((row) => ({
        id: row.id || null,
        className: row.class_name || null,
        subject: row.subject || null,
        startTime: row.start_time || null,
        endTime: row.end_time || null,
        room: row.room || null,
      })),
      totalClasses: await countBySchool("sections", schoolId, schoolCode),
      pendingAttendance,
      assignmentsToReview: 0,
      notifications: await listRecentNotifications(schoolId, schoolCode, 5),
    };
  }

  async function getParentOverview({ userId, schoolId, schoolCode }) {
    const studentIdColumn = await getColumn("students", ["student_id", "id"]);
    const parentUserIdColumn = await getColumn("students", [
      "parent_user_id",
      "guardian_user_id",
      "parent_id",
    ]);
    const studentNameColumn = await getColumn("students", [
      "full_name",
      "name",
    ]);
    const rollNumberColumn = await getColumn("students", [
      "roll_no",
      "roll_number",
    ]);
    const classIdColumn = await getColumn("students", ["class_id", "classid"]);
    const sectionIdColumn = await getColumn("students", [
      "section_id",
      "sectionid",
    ]);

    if (!studentIdColumn || !parentUserIdColumn) {
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
        notifications: await listRecentNotifications(schoolId, schoolCode, 5),
      };
    }

    const schoolFilter = await buildSchoolFilter(
      "students",
      "",
      schoolId,
      schoolCode,
      2,
    );
    const childrenResult = await pool.query(
      `
        SELECT
          ${quoteIdentifier(studentIdColumn)}::text AS student_id,
          ${studentNameColumn ? `${quoteIdentifier(studentNameColumn)}::text` : `NULL::text`} AS name,
          ${rollNumberColumn ? `${quoteIdentifier(rollNumberColumn)}::text` : `NULL::text`} AS roll_number,
          ${classIdColumn ? `${quoteIdentifier(classIdColumn)}::text` : `NULL::text`} AS class_id,
          ${sectionIdColumn ? `${quoteIdentifier(sectionIdColumn)}::text` : `NULL::text`} AS section_id
        FROM "students"
        WHERE ${quoteIdentifier(parentUserIdColumn)}::text = $1::text
          AND ${schoolFilter.clause}
        LIMIT 10;
      `,
      [userId, ...schoolFilter.params],
    );

    const studentIds = childrenResult.rows
      .map((row) => row.student_id)
      .filter((value) => Boolean(value));

    let recentResults = [];
    if (studentIds.length > 0) {
      const resultsSchoolFilter = await buildSchoolFilter(
        "results",
        "",
        schoolId,
        schoolCode,
        2,
      );
      const resultIdColumn = await getColumn("results", ["result_id", "id"]);
      const subjectColumn = await getColumn("results", [
        "subject",
        "subject_name",
      ]);
      const marksColumn = await getColumn("results", ["marks", "score"]);
      const gradeColumn = await getColumn("results", ["grade"]);
      const createdAtColumn =
        (await getColumn("results", [
          "created_at",
          "published_at",
          "exam_date",
        ])) || "created_at";
      const resultsResult = await pool.query(
        `
          SELECT
            ${resultIdColumn ? `${quoteIdentifier(resultIdColumn)}::text` : `NULL::text`} AS result_id,
            student_id::text AS student_id,
            exam_id::text AS exam_id,
            ${subjectColumn ? `${quoteIdentifier(subjectColumn)}::text` : `NULL::text`} AS subject,
            ${marksColumn ? `${quoteIdentifier(marksColumn)}` : `NULL`} AS marks,
            ${gradeColumn ? `${quoteIdentifier(gradeColumn)}::text` : `NULL::text`} AS grade,
            ${quoteIdentifier(createdAtColumn)} AS created_at
          FROM "results"
          WHERE student_id::text = ANY($1::text[])
            AND ${resultsSchoolFilter.clause}
          ORDER BY ${quoteIdentifier(createdAtColumn)} DESC NULLS LAST
          LIMIT 5;
        `,
        [studentIds, ...resultsSchoolFilter.params],
      );
      recentResults = resultsResult.rows.map(normalizeResult);
    }

    const feeSummary = await sumFees(schoolId, schoolCode, studentIds);

    return {
      childInfo: childrenResult.rows.map((row) => ({
        studentId: row.student_id || null,
        name: row.name || null,
        rollNumber: row.roll_number || null,
        classId: row.class_id || null,
        sectionId: row.section_id || null,
      })),
      attendancePercentage: await getAttendancePercentage(
        schoolId,
        schoolCode,
        studentIds,
      ),
      recentResults,
      feeStatus: {
        ...feeSummary,
        status:
          feeSummary.totalFees === 0
            ? "NO_FEES"
            : feeSummary.pendingFees > 0
              ? feeSummary.paidFees > 0
                ? "PARTIAL"
                : "PENDING"
              : "PAID",
      },
      notifications: await listRecentNotifications(schoolId, schoolCode, 5),
    };
  }

  async function getStudentOverview({ userId, schoolId, schoolCode }) {
    const studentRecord = await resolveStudentRecord(
      userId,
      schoolId,
      schoolCode,
    );
    if (!studentRecord) {
      throw createNotFoundError(
        "Student not found",
        "No student record found for authenticated user",
      );
    }

    const classesPkColumn = await getColumn("classes", ["class_id", "id"]);
    const classesNameColumn = await getColumn("classes", [
      "class_name",
      "name",
    ]);
    const classStartColumn = await getColumn("classes", ["start_time"]);
    const classEndColumn = await getColumn("classes", ["end_time"]);
    const classSubjectColumn = await getColumn("classes", [
      "subject_name",
      "subject",
    ]);

    let todayClasses = [];
    if (studentRecord.class_id && classesPkColumn) {
      const classesResult = await pool.query(
        `
          SELECT
            ${quoteIdentifier(classesPkColumn)}::text AS id,
            ${classesNameColumn ? `${quoteIdentifier(classesNameColumn)}::text` : `NULL::text`} AS class_name,
            ${classStartColumn ? `${quoteIdentifier(classStartColumn)}` : `NULL`} AS start_time,
            ${classEndColumn ? `${quoteIdentifier(classEndColumn)}` : `NULL`} AS end_time,
            ${classSubjectColumn ? `${quoteIdentifier(classSubjectColumn)}::text` : `NULL::text`} AS subject
          FROM "classes"
          WHERE ${quoteIdentifier(classesPkColumn)}::text = $1::text
          LIMIT 5;
        `,
        [studentRecord.class_id],
      );

      todayClasses = classesResult.rows.map((row) => ({
        id: row.id || null,
        className: row.class_name || null,
        startTime: row.start_time || null,
        endTime: row.end_time || null,
        subject: row.subject || null,
      }));
    }

    const recentResults = await (async () => {
      const resultsSchoolFilter = await buildSchoolFilter(
        "results",
        "",
        schoolId,
        schoolCode,
        2,
      );
      const resultIdColumn = await getColumn("results", ["result_id", "id"]);
      const subjectColumn = await getColumn("results", [
        "subject",
        "subject_name",
      ]);
      const marksColumn = await getColumn("results", ["marks", "score"]);
      const gradeColumn = await getColumn("results", ["grade"]);
      const createdAtColumn =
        (await getColumn("results", [
          "created_at",
          "published_at",
          "exam_date",
        ])) || "created_at";

      const result = await pool.query(
        `
          SELECT
            ${resultIdColumn ? `${quoteIdentifier(resultIdColumn)}::text` : `NULL::text`} AS result_id,
            student_id::text AS student_id,
            exam_id::text AS exam_id,
            ${subjectColumn ? `${quoteIdentifier(subjectColumn)}::text` : `NULL::text`} AS subject,
            ${marksColumn ? `${quoteIdentifier(marksColumn)}` : `NULL`} AS marks,
            ${gradeColumn ? `${quoteIdentifier(gradeColumn)}::text` : `NULL::text`} AS grade,
            ${quoteIdentifier(createdAtColumn)} AS created_at
          FROM "results"
          WHERE student_id::text = $1::text
            AND ${resultsSchoolFilter.clause}
          ORDER BY ${quoteIdentifier(createdAtColumn)} DESC NULLS LAST
          LIMIT 5;
        `,
        [studentRecord.student_id, ...resultsSchoolFilter.params],
      );

      return result.rows.map(normalizeResult);
    })();

    const examDateColumn = await getColumn("exams", ["exam_date", "date"]);
    const examNameColumn = await getColumn("exams", [
      "exam_name",
      "title",
      "name",
    ]);
    const examSubjectColumn = await getColumn("exams", [
      "subject",
      "subject_name",
    ]);
    const examIdColumn = await getColumn("exams", ["exam_id", "id"]);
    const examClassIdColumn = await getColumn("exams", ["class_id", "classid"]);
    const examSectionIdColumn = await getColumn("exams", [
      "section_id",
      "sectionid",
    ]);
    const examsSchoolFilter = await buildSchoolFilter(
      "exams",
      "",
      schoolId,
      schoolCode,
      2,
    );

    let upcomingExams = [];
    if (examDateColumn) {
      const examConditions = [
        examsSchoolFilter.clause,
        `DATE(${quoteIdentifier(examDateColumn)}) >= $1::date`,
      ];
      const examParams = [
        new Date().toISOString().slice(0, 10),
        ...examsSchoolFilter.params,
      ];

      if (studentRecord.section_id && examSectionIdColumn) {
        examParams.push(studentRecord.section_id);
        examConditions.push(
          `${quoteIdentifier(examSectionIdColumn)}::text = $${examParams.length}::text`,
        );
      } else if (studentRecord.class_id && examClassIdColumn) {
        examParams.push(studentRecord.class_id);
        examConditions.push(
          `${quoteIdentifier(examClassIdColumn)}::text = $${examParams.length}::text`,
        );
      }

      const examsResult = await pool.query(
        `
          SELECT
            ${examIdColumn ? `${quoteIdentifier(examIdColumn)}::text` : `NULL::text`} AS exam_id,
            ${examNameColumn ? `${quoteIdentifier(examNameColumn)}::text` : `NULL::text`} AS title,
            ${examSubjectColumn ? `${quoteIdentifier(examSubjectColumn)}::text` : `NULL::text`} AS subject,
            ${quoteIdentifier(examDateColumn)} AS exam_date
          FROM "exams"
          WHERE ${examConditions.join(" AND ")}
          ORDER BY ${quoteIdentifier(examDateColumn)} ASC NULLS LAST
          LIMIT 5;
        `,
        examParams,
      );

      upcomingExams = examsResult.rows.map((row) => ({
        id: row.exam_id || null,
        title: row.title || null,
        subject: row.subject || null,
        examDate: row.exam_date || null,
      }));
    }

    return {
      todayClasses,
      pendingAssignments: 0,
      attendancePercentage: await getAttendancePercentage(
        schoolId,
        schoolCode,
        [studentRecord.student_id],
      ),
      recentMarks: recentResults,
      upcomingExams,
    };
  }

  return {
    resolveSchoolContext,
    getOwnerOverview,
    getItAdminOverview,
    getTeacherOverview,
    getParentOverview,
    getStudentOverview,
  };
}

module.exports = {
  createDashboardRepository,
};
