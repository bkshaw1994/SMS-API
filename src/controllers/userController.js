const crypto = require("crypto");

function createUserController({ pool, buildDbError, findFirstExistingColumn }) {
  function generateRandomPassword(length = 12) {
    // Keep one symbol to satisfy basic complexity without introducing whitespace.
    const chars =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$%!";
    let password = "";
    for (let i = 0; i < length; i += 1) {
      password += chars[crypto.randomInt(chars.length)];
    }
    return password;
  }

  function getRequesterRole(req) {
    return String(req.user?.role || "")
      .trim()
      .toUpperCase();
  }

  function getRequesterUserId(req) {
    return typeof req.user?.userId === "string" ||
      typeof req.user?.userId === "number"
      ? String(req.user.userId).trim()
      : "";
  }

  async function resolveTeacherIdByUserId(userId) {
    return pool.query(
      `
        SELECT teacher_id
        FROM teachers
        WHERE user_id = $1
        LIMIT 1;
      `,
      [userId],
    );
  }

  async function addUser(req, res) {
    const schoolCode =
      typeof req.body?.schoolCode === "string" ||
      typeof req.body?.schoolCode === "number"
        ? String(req.body.schoolCode).trim()
        : "";
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const email =
      typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const phone =
      typeof req.body?.phone === "string" || typeof req.body?.phone === "number"
        ? String(req.body.phone).trim()
        : "";
    const status =
      typeof req.body?.status === "string" ||
      typeof req.body?.status === "number"
        ? String(req.body.status).trim()
        : "ACTIVE";
    const role = typeof req.body?.role === "string" ? req.body.role.trim() : "";

    if (!schoolCode || !name || !email || !phone || !role) {
      return res.status(400).json({
        error: "schoolCode, name, email, phone, and role are required",
      });
    }

    const createdBy =
      typeof req.user?.userId === "string" ||
      typeof req.user?.userId === "number"
        ? String(req.user.userId).trim()
        : "";

    if (!createdBy) {
      return res.status(401).json({
        error: "Unauthorized",
        details: "Token does not contain userId",
      });
    }

    try {
      const schoolCodeLookupColumn = await findFirstExistingColumn(
        pool,
        "school",
        ["school_code", "schoolcode", "code"],
      );
      const schoolPkColumn = await findFirstExistingColumn(pool, "school", [
        "school_id",
        "id",
      ]);
      if (!schoolCodeLookupColumn) {
        return res.status(500).json({
          error: "Failed to add user",
          details: "No supported school code column found in table 'school'",
        });
      }

      const schoolSelectPkSql = schoolPkColumn
        ? `, "${schoolPkColumn}"::text AS school_pk`
        : "";
      const schoolResult = await pool.query(
        `
          SELECT "${schoolCodeLookupColumn}"::text AS school_code_value${schoolSelectPkSql}
          FROM "school"
          WHERE LOWER("${schoolCodeLookupColumn}"::text) = LOWER($1)
          LIMIT 1;
        `,
        [schoolCode],
      );

      if (schoolResult.rowCount === 0) {
        return res.status(400).json({
          error: "Invalid schoolCode",
          schoolCode,
        });
      }

      const userSchoolIdColumn = await findFirstExistingColumn(pool, "users", [
        "school_id",
        "schoolid",
      ]);
      const nameColumn = await findFirstExistingColumn(pool, "users", [
        "name",
        "full_name",
        "user_name",
        "username",
      ]);
      const emailColumn = await findFirstExistingColumn(pool, "users", [
        "email",
        "email_id",
        "mail",
      ]);
      const phoneColumn = await findFirstExistingColumn(pool, "users", [
        "phone",
        "mobile",
        "phone_number",
        "contact_no",
        "whatsapp",
      ]);
      const statusColumn = await findFirstExistingColumn(pool, "users", [
        "status",
        "user_status",
      ]);
      const roleIdColumn = await findFirstExistingColumn(pool, "users", [
        "role_id",
        "roleid",
      ]);
      const passwordColumnsResult = await pool.query(
        `
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'users'
            AND column_name IN (
              'password_hash',
              'passwordhash',
              'password',
              'user_password',
              'passcode'
            )
          ORDER BY CASE
            WHEN column_name = 'password_hash' THEN 1
            WHEN column_name = 'passwordhash' THEN 2
            WHEN column_name = 'password' THEN 3
            WHEN column_name = 'user_password' THEN 4
            WHEN column_name = 'passcode' THEN 5
            ELSE 99
          END;
        `,
      );
      const passwordColumns = passwordColumnsResult.rows.map(
        (row) => row.column_name,
      );
      const createdByColumn = await findFirstExistingColumn(pool, "users", [
        "created_by",
        "createdby",
      ]);

      if (
        !userSchoolIdColumn ||
        !schoolPkColumn ||
        !schoolResult.rows[0].school_pk
      ) {
        return res.status(500).json({
          error: "Failed to add user",
          details:
            "users table expects school_id but no supported school primary key column found in table 'school'",
        });
      }

      if (
        !userSchoolIdColumn ||
        !nameColumn ||
        !emailColumn ||
        !phoneColumn ||
        !statusColumn ||
        !roleIdColumn ||
        passwordColumns.length === 0 ||
        !createdByColumn
      ) {
        return res.status(500).json({
          error: "Failed to add user",
          details:
            "Required user columns not found. Expected school_id, name, email, phone, status, role_id, password, and created_by columns in 'users' table",
        });
      }

      const rolesTableResult = await pool.query(
        `
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name IN ('roles', 'roles1')
          ORDER BY CASE
            WHEN table_name = 'roles' THEN 1
            WHEN table_name = 'roles1' THEN 2
            ELSE 99
          END
          LIMIT 1;
        `,
      );

      if (rolesTableResult.rowCount === 0) {
        return res.status(500).json({
          error: "Failed to add user",
          details: "Roles table not found (expected 'roles' or 'roles1')",
        });
      }

      const rolesTableName = rolesTableResult.rows[0].table_name;
      const roleNameColumn = await findFirstExistingColumn(
        pool,
        rolesTableName,
        ["role", "role_name", "name", "title", "type"],
      );
      const rolePkColumn = await findFirstExistingColumn(pool, rolesTableName, [
        "role_id",
        "id",
      ]);

      if (!roleNameColumn || !rolePkColumn) {
        return res.status(500).json({
          error: "Failed to add user",
          details:
            "No supported role name/id columns found in roles table for role lookup",
        });
      }

      const roleLookupResult = await pool.query(
        `
          SELECT "${rolePkColumn}"::text AS resolved_role_id
          FROM "${rolesTableName}"
          WHERE UPPER("${roleNameColumn}"::text) = UPPER($1)
          LIMIT 1;
        `,
        [role],
      );

      if (roleLookupResult.rowCount === 0) {
        return res.status(400).json({
          error: "Invalid role",
          role,
        });
      }

      const generatedPassword = generateRandomPassword();
      const passwordColumnSql = passwordColumns
        .map((column) => `"${column}"`)
        .join(",\n          ");
      const passwordValuePlaceholders = passwordColumns
        .map((_, index) => `$${7 + index}`)
        .join(", ");
      const createdByPlaceholder = `$${7 + passwordColumns.length}`;

      const insertQuery = `
        INSERT INTO "users" (
          "${userSchoolIdColumn}",
          "${nameColumn}",
          "${emailColumn}",
          "${phoneColumn}",
          "${statusColumn}",
          "${roleIdColumn}",
          ${passwordColumnSql},
          "${createdByColumn}"
        )
        VALUES ($1, $2, $3, $4, $5, $6, ${passwordValuePlaceholders}, ${createdByPlaceholder})
        RETURNING *;
      `;

      const result = await pool.query(insertQuery, [
        schoolResult.rows[0].school_pk,
        name,
        email,
        phone,
        status,
        roleLookupResult.rows[0].resolved_role_id,
        ...passwordColumns.map(() => generatedPassword),
        createdBy,
      ]);

      return res.status(201).json({
        success: true,
        message: "User added successfully",
        generatedPassword,
        user: result.rows[0],
      });
    } catch (error) {
      return res.status(500).json(buildDbError(error, "Failed to add user"));
    }
  }

  async function teacherAssignedClasses(req, res) {
    const requesterRole = getRequesterRole(req);

    const requestedSchoolId =
      typeof req.query?.school_ID === "string" ||
      typeof req.query?.school_ID === "number"
        ? String(req.query.school_ID).trim()
        : typeof req.query?.schoolId === "string" ||
            typeof req.query?.schoolId === "number"
          ? String(req.query.schoolId).trim()
          : typeof req.query?.school_id === "string" ||
              typeof req.query?.school_id === "number"
            ? String(req.query.school_id).trim()
            : "";

    if (requestedSchoolId) {
      const allowedRoles = ["SUPERADMIN", "OWNER", "ITADMIN", "TEACHER"];
      if (!allowedRoles.includes(requesterRole)) {
        return res.status(403).json({
          error: "Forbidden",
          details:
            "Only SUPERADMIN, OWNER, ITADMIN, or TEACHER can access this endpoint with school_ID",
        });
      }

      try {
        const schoolPkColumn = await findFirstExistingColumn(pool, "school", [
          "school_id",
          "id",
        ]);
        const schoolCodeColumn = await findFirstExistingColumn(pool, "school", [
          "school_code",
          "schoolcode",
          "code",
        ]);

        if (!schoolPkColumn && !schoolCodeColumn) {
          return res.status(500).json({
            error: "Failed to fetch school data",
            details:
              "No supported school id/code columns found in table 'school'",
          });
        }

        let schoolResult = { rowCount: 0, rows: [] };
        if (schoolPkColumn) {
          schoolResult = await pool.query(
            `
              SELECT
                "${schoolPkColumn}"::text AS school_pk,
                ${schoolCodeColumn ? `"${schoolCodeColumn}"::text` : `NULL::text`} AS school_code
              FROM "school"
              WHERE "${schoolPkColumn}"::text = $1::text
              LIMIT 1;
            `,
            [requestedSchoolId],
          );
        }

        if (schoolResult.rowCount === 0 && schoolCodeColumn) {
          schoolResult = await pool.query(
            `
              SELECT
                ${schoolPkColumn ? `"${schoolPkColumn}"::text` : `NULL::text`} AS school_pk,
                "${schoolCodeColumn}"::text AS school_code
              FROM "school"
              WHERE LOWER("${schoolCodeColumn}"::text) = LOWER($1)
              LIMIT 1;
            `,
            [requestedSchoolId],
          );
        }

        if (schoolResult.rowCount === 0) {
          return res.status(404).json({
            error: "School not found",
            school_ID: requestedSchoolId,
          });
        }

        const resolvedSchoolPk = schoolResult.rows[0].school_pk || null;
        const resolvedSchoolCode = schoolResult.rows[0].school_code || null;

        if (requesterRole !== "SUPERADMIN") {
          const tokenSchoolCode =
            typeof req.user?.schoolCode === "string"
              ? req.user.schoolCode.trim()
              : "";
          if (
            tokenSchoolCode &&
            resolvedSchoolCode &&
            tokenSchoolCode.toLowerCase() !== resolvedSchoolCode.toLowerCase()
          ) {
            return res.status(403).json({
              error: "Forbidden",
              details: "You can only access data for your own school",
            });
          }
        }

        const classIdColumn = await findFirstExistingColumn(pool, "classes", [
          "class_id",
          "id",
        ]);
        const classNameColumn = await findFirstExistingColumn(pool, "classes", [
          "class_name",
          "name",
          "title",
          "class",
        ]);
        if (!classNameColumn) {
          return res.status(500).json({
            error: "Failed to fetch classes",
            details: "No supported class name column found in table 'classes'",
          });
        }

        const classSchoolIdColumn = await findFirstExistingColumn(
          pool,
          "classes",
          ["school_id", "schoolid"],
        );
        const classSchoolCodeColumn = await findFirstExistingColumn(
          pool,
          "classes",
          ["school_code", "schoolcode"],
        );

        let classWhereSql = "";
        const classValues = [];
        if (classSchoolIdColumn && resolvedSchoolPk) {
          classWhereSql = `WHERE "${classSchoolIdColumn}"::text = $1::text`;
          classValues.push(resolvedSchoolPk);
        } else if (classSchoolCodeColumn && resolvedSchoolCode) {
          classWhereSql = `WHERE "${classSchoolCodeColumn}"::text = $1::text`;
          classValues.push(resolvedSchoolCode);
        }

        const classesResult = await pool.query(
          `
            SELECT
              ${classIdColumn ? `"${classIdColumn}"::text` : `NULL::text`} AS class_id,
              "${classNameColumn}"::text AS class_name
            FROM "classes"
            ${classWhereSql}
            ORDER BY class_name NULLS LAST;
          `,
          classValues,
        );

        const teacherTableResult = await pool.query(
          `
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = 'teachers'
            LIMIT 1;
          `,
        );

        if (teacherTableResult.rowCount === 0) {
          return res.status(500).json({
            error: "Failed to fetch teachers",
            details: "Table 'teachers' not found",
          });
        }

        const teacherIdColumn = await findFirstExistingColumn(
          pool,
          "teachers",
          ["teacher_id", "id"],
        );
        const teacherNameColumn = await findFirstExistingColumn(
          pool,
          "teachers",
          ["name", "teacher_name", "full_name"],
        );
        const teacherSchoolIdColumn = await findFirstExistingColumn(
          pool,
          "teachers",
          ["school_id", "schoolid"],
        );
        const teacherSchoolCodeColumn = await findFirstExistingColumn(
          pool,
          "teachers",
          ["school_code", "schoolcode", "code"],
        );
        const teacherUserIdColumn = await findFirstExistingColumn(
          pool,
          "teachers",
          ["user_id", "userid"],
        );

        const usersTableResult = await pool.query(
          `
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = 'users'
            LIMIT 1;
          `,
        );
        const usersExists = usersTableResult.rowCount > 0;
        const userPkColumn = usersExists
          ? await findFirstExistingColumn(pool, "users", ["user_id", "id"])
          : null;
        const userNameColumn = usersExists
          ? await findFirstExistingColumn(pool, "users", [
              "name",
              "full_name",
              "user_name",
              "username",
            ])
          : null;
        const userEmailColumn = usersExists
          ? await findFirstExistingColumn(pool, "users", [
              "email",
              "email_id",
              "mail",
            ])
          : null;
        const userPhoneColumn = usersExists
          ? await findFirstExistingColumn(pool, "users", [
              "phone",
              "mobile",
              "phone_number",
              "contact_no",
              "whatsapp",
            ])
          : null;

        const canJoinUsers =
          usersExists && teacherUserIdColumn && userPkColumn && userNameColumn;
        const teacherNameSelectSql = teacherNameColumn
          ? `t."${teacherNameColumn}"::text`
          : canJoinUsers
            ? `u."${userNameColumn}"::text`
            : `NULL::text`;
        const teacherEmailSelectSql = canJoinUsers
          ? userEmailColumn
            ? `u."${userEmailColumn}"::text`
            : `NULL::text`
          : `NULL::text`;
        const teacherPhoneSelectSql = canJoinUsers
          ? userPhoneColumn
            ? `u."${userPhoneColumn}"::text`
            : `NULL::text`
          : `NULL::text`;
        const teacherJoinSql = canJoinUsers
          ? `LEFT JOIN "users" u ON u."${userPkColumn}"::text = t."${teacherUserIdColumn}"::text`
          : "";

        let teacherWhereSql = "";
        const teacherValues = [];
        if (teacherSchoolIdColumn && resolvedSchoolPk) {
          teacherWhereSql = `WHERE t."${teacherSchoolIdColumn}"::text = $1::text`;
          teacherValues.push(resolvedSchoolPk);
        } else if (teacherSchoolCodeColumn && resolvedSchoolCode) {
          teacherWhereSql = `WHERE t."${teacherSchoolCodeColumn}"::text = $1::text`;
          teacherValues.push(resolvedSchoolCode);
        }

        const teachersResult = await pool.query(
          `
            SELECT
              ${teacherIdColumn ? `t."${teacherIdColumn}"::text` : `NULL::text`} AS teacher_id,
              ${teacherNameSelectSql} AS name,
              ${teacherEmailSelectSql} AS email,
              ${teacherPhoneSelectSql} AS phone
            FROM "teachers" t
            ${teacherJoinSql}
            ${teacherWhereSql}
            ORDER BY name NULLS LAST;
          `,
          teacherValues,
        );

        return res.json({
          school_id: resolvedSchoolPk,
          school_code: resolvedSchoolCode,
          classCount: classesResult.rowCount,
          teacherCount: teachersResult.rowCount,
          classes: classesResult.rows,
          teachers: teachersResult.rows,
        });
      } catch (error) {
        return res
          .status(500)
          .json(buildDbError(error, "Failed to fetch classes and teachers"));
      }
    }

    if (requesterRole !== "TEACHER") {
      return res.status(403).json({
        error: "Forbidden",
        details: "Only TEACHER can access this endpoint",
      });
    }

    const userId = getRequesterUserId(req);

    if (!userId) {
      return res.status(401).json({
        error: "Unauthorized",
        details: "Token does not contain userId",
      });
    }

    try {
      const teacherResult = await resolveTeacherIdByUserId(userId);

      if (teacherResult.rowCount === 0) {
        return res.status(404).json({
          error: "Teacher not found",
          details: "No teacher record is mapped to the logged-in user",
          userId,
        });
      }

      const teacherId = teacherResult.rows[0].teacher_id;
      const result = await pool.query(
        `
          SELECT
            s.section_id,
            c.class_name,
            s.section_name
          FROM sections s
          JOIN classes c
            ON s.class_id = c.class_id
          WHERE s.class_teacher_id = $1
          ORDER BY c.class_name, s.section_name;
        `,
        [teacherId],
      );

      return res.json({
        teacherId,
        classes: result.rows,
      });
    } catch (error) {
      return res
        .status(500)
        .json(buildDbError(error, "Failed to fetch teacher assigned classes"));
    }
  }

  async function studentsBySection(req, res) {
    const requesterRole = getRequesterRole(req);

    if (requesterRole !== "TEACHER") {
      return res.status(403).json({
        error: "Forbidden",
        details: "Only TEACHER can access this endpoint",
      });
    }

    const userId = getRequesterUserId(req);
    const sectionId =
      typeof req.params?.sectionId === "string" ||
      typeof req.params?.sectionId === "number"
        ? String(req.params.sectionId).trim()
        : "";

    if (!userId) {
      return res.status(401).json({
        error: "Unauthorized",
        details: "Token does not contain userId",
      });
    }

    if (!sectionId) {
      return res.status(400).json({
        error: "sectionId is required",
      });
    }

    try {
      const teacherResult = await resolveTeacherIdByUserId(userId);

      if (teacherResult.rowCount === 0) {
        return res.status(404).json({
          error: "Teacher not found",
          details: "No teacher record is mapped to the logged-in user",
          userId,
        });
      }

      const teacherId = teacherResult.rows[0].teacher_id;

      const sectionAccessResult = await pool.query(
        `
          SELECT section_id
          FROM sections
          WHERE section_id = $1
            AND class_teacher_id = $2
          LIMIT 1;
        `,
        [sectionId, teacherId],
      );

      if (sectionAccessResult.rowCount === 0) {
        return res.status(404).json({
          error: "Section not found",
          details:
            "No section is assigned to the logged-in teacher for this sectionId",
          sectionId,
          teacherId,
        });
      }

      const result = await pool.query(
        `
          SELECT
            s.student_id,
            s.user_id,
            s.admission_no,
            se.roll_no,
            u.name,
            u.email,
            u.phone,
            u.whatsapp
          FROM student_enrollments se
          JOIN students s
            ON se.student_id = s.student_id
          LEFT JOIN users u
            ON s.user_id = u.user_id
          WHERE se.section_id = $1
          ORDER BY se.roll_no NULLS LAST, u.name NULLS LAST, s.student_id;
        `,
        [sectionId],
      );

      return res.json({
        teacherId,
        sectionId,
        students: result.rows,
      });
    } catch (error) {
      return res
        .status(500)
        .json(buildDbError(error, "Failed to fetch students for section"));
    }
  }

  return {
    addUser,
    teacherAssignedClasses,
    studentsBySection,
  };
}

module.exports = {
  createUserController,
};
