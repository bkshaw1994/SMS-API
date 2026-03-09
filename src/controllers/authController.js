const jwt = require("jsonwebtoken");

function createAuthController({
  pool,
  buildDbError,
  findFirstExistingColumn,
  findExistingColumns,
  addTokenToBlacklist,
  jwtSecret,
  jwtExpiresIn,
}) {
  async function resolveUserRole({ userRole, userRoleId }) {
    let resolvedRole = userRole || null;

    if (!userRoleId) {
      return resolvedRole;
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
      return resolvedRole;
    }

    const rolesTableName = rolesTableResult.rows[0].table_name;
    const rolePkColumn = await findFirstExistingColumn(pool, rolesTableName, [
      "role_id",
      "id",
    ]);
    const roleNameColumn = await findFirstExistingColumn(pool, rolesTableName, [
      "role",
      "role_name",
      "name",
      "title",
      "type",
    ]);

    if (!rolePkColumn || !roleNameColumn) {
      return resolvedRole;
    }

    const roleLookupResult = await pool.query(
      `
        SELECT "${roleNameColumn}"::text AS resolved_role
        FROM "${rolesTableName}"
        WHERE "${rolePkColumn}"::text = $1::text
        LIMIT 1;
      `,
      [userRoleId],
    );

    if (roleLookupResult.rowCount > 0) {
      resolvedRole = roleLookupResult.rows[0].resolved_role || resolvedRole;
    }

    return resolvedRole;
  }

  async function validateLogin(req, res) {
    const schoolCode =
      typeof req.body?.schoolCode === "string"
        ? req.body.schoolCode.trim()
        : "";
    const email =
      typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";

    if (!schoolCode || !email || !password) {
      return res.status(400).json({
        error: "schoolCode, email, and password are required",
      });
    }

    try {
      const schoolCodeColumn = "school_code";
      const schoolPkColumn = "school_id";
      const loginColumn = "email";

      const passwordColumns = await findExistingColumns(pool, "users", [
        "password_hash",
        "passwordhash",
        "password",
        "user_password",
        "passcode",
      ]);

      if (!loginColumn || passwordColumns.length === 0) {
        return res.status(500).json({
          error: "Failed to validate login",
          details: "No supported login/password columns found in table 'users'",
        });
      }

      const userSchoolFkColumn = "school_id";
      const userSchoolCodeColumn = await findFirstExistingColumn(
        pool,
        "users",
        ["school_code", "schoolcode", "code"],
      );
      const roleColumn = await findFirstExistingColumn(pool, "users", [
        "role",
        "user_role",
        "role_name",
      ]);
      const roleIdColumn = await findFirstExistingColumn(pool, "users", [
        "role_id",
        "roleid",
      ]);
      const userIdColumn = await findFirstExistingColumn(pool, "users", [
        "user_id",
        "id",
      ]);
      const nameColumns = await findExistingColumns(pool, "users", [
        "full_name",
        "name",
        "user_name",
        "username",
      ]);
      const phoneColumns = await findExistingColumns(pool, "users", [
        "phone",
        "mobile",
        "phone_number",
        "contact_no",
        "whatsapp",
      ]);

      const schoolSelectSql = schoolPkColumn
        ? `"${schoolPkColumn}" AS school_pk`
        : "1";
      const schoolQuery = `
        SELECT ${schoolSelectSql}
        FROM "school"
        WHERE LOWER("${schoolCodeColumn}"::text) = LOWER($1)
        LIMIT 1;
      `;
      const schoolResult = await pool.query(schoolQuery, [schoolCode]);
      const schoolExists = schoolResult.rowCount > 0;
      const schoolPkValue =
        schoolExists && schoolPkColumn ? schoolResult.rows[0].school_pk : null;

      if (!schoolExists) {
        return res.json({ valid: false, reason: "Invalid school code" });
      }

      const passwordSelectSql = passwordColumns
        .map((column) => `"${column}"::text AS "pw__${column}"`)
        .join(", ");
      const roleSelectSql = roleColumn
        ? `, "${roleColumn}"::text AS user_role`
        : "";
      const roleIdSelectSql = roleIdColumn
        ? `, "${roleIdColumn}"::text AS user_role_id`
        : "";
      const userIdSelectSql = userIdColumn
        ? `, "${userIdColumn}"::text AS token_user_id`
        : "";
      const nameSelectSql = nameColumns
        .map((column) => `, "${column}"::text AS "nm__${column}"`)
        .join("");
      const phoneSelectSql = phoneColumns
        .map((column) => `, "${column}"::text AS "ph__${column}"`)
        .join("");

      let credentialQuery = "";
      let params = [];

      if (userSchoolFkColumn && schoolPkValue !== null) {
        credentialQuery = `
            SELECT ${passwordSelectSql}${roleSelectSql}${roleIdSelectSql}${userIdSelectSql}${nameSelectSql}${phoneSelectSql}
          FROM "users"
          WHERE "${userSchoolFkColumn}" = $1
            AND LOWER("${loginColumn}"::text) = LOWER($2)
          LIMIT 1;
        `;
        params = [schoolPkValue, email];
      } else if (userSchoolCodeColumn) {
        credentialQuery = `
            SELECT ${passwordSelectSql}${roleSelectSql}${roleIdSelectSql}${userIdSelectSql}${nameSelectSql}${phoneSelectSql}
          FROM "users"
          WHERE LOWER("${userSchoolCodeColumn}"::text) = LOWER($1)
            AND LOWER("${loginColumn}"::text) = LOWER($2)
          LIMIT 1;
        `;
        params = [schoolCode, email];
      } else {
        return res.status(500).json({
          error: "Failed to validate login",
          details: "No supported school link column found in table 'users'",
        });
      }

      const credentialResult = await pool.query(credentialQuery, params);
      if (credentialResult.rowCount === 0) {
        return res.json({
          valid: false,
          reason: "User not found for this school",
          schoolCode,
          email,
        });
      }

      const userRow = credentialResult.rows[0];
      const storedPassword = passwordColumns
        .map((column) => userRow[`pw__${column}`])
        .find(
          (value) =>
            value !== null &&
            value !== undefined &&
            String(value).trim() !== "",
        );
      const resolvedName = nameColumns
        .map((column) => userRow[`nm__${column}`])
        .find(
          (value) =>
            value !== null &&
            value !== undefined &&
            String(value).trim() !== "",
        );
      const resolvedPhone = phoneColumns
        .map((column) => userRow[`ph__${column}`])
        .find(
          (value) =>
            value !== null &&
            value !== undefined &&
            String(value).trim() !== "",
        );
      const resolvedUserId = userRow.token_user_id || null;
      const resolvedRole = await resolveUserRole({
        userRole: userRow.user_role,
        userRoleId: userRow.user_role_id,
      });

      if (!storedPassword) {
        return res.status(500).json({
          error: "Failed to validate login",
          details: "No password value found for matched user",
        });
      }

      const passwordValid = password === String(storedPassword);
      if (!passwordValid) {
        return res.json({
          valid: false,
          reason: "Incorrect password",
          schoolCode,
          email,
          userId: resolvedUserId,
          role: resolvedRole,
          name: resolvedName || null,
          phone: resolvedPhone || null,
        });
      }

      const token = jwt.sign(
        {
          schoolCode,
          email,
          userId: resolvedUserId,
          role: resolvedRole,
        },
        jwtSecret,
        { expiresIn: jwtExpiresIn },
      );

      return res.json({
        valid: true,
        schoolCode,
        email,
        userId: resolvedUserId,
        role: resolvedRole,
        name: resolvedName || null,
        phone: resolvedPhone || null,
        token,
      });
    } catch (error) {
      return res
        .status(500)
        .json(buildDbError(error, "Failed to validate login"));
    }
  }

  async function superAdminLogin(req, res) {
    const email =
      typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";

    if (!email || !password) {
      return res.status(400).json({
        error: "email and password are required",
      });
    }

    try {
      const loginColumn = "email";

      const passwordColumns = await findExistingColumns(pool, "users", [
        "password_hash",
        "passwordhash",
        "password",
        "user_password",
        "passcode",
      ]);
      const roleColumn = await findFirstExistingColumn(pool, "users", [
        "role",
        "user_role",
        "role_name",
      ]);
      const roleIdColumn = await findFirstExistingColumn(pool, "users", [
        "role_id",
        "roleid",
      ]);
      const userIdColumn = await findFirstExistingColumn(pool, "users", [
        "user_id",
        "id",
      ]);
      const nameColumns = await findExistingColumns(pool, "users", [
        "full_name",
        "name",
        "user_name",
        "username",
      ]);
      const phoneColumns = await findExistingColumns(pool, "users", [
        "phone",
        "mobile",
        "phone_number",
        "contact_no",
        "whatsapp",
      ]);

      if (passwordColumns.length === 0) {
        return res.status(500).json({
          error: "Failed to validate superadmin login",
          details: "No supported password columns found in table 'users'",
        });
      }

      const passwordSelectSql = passwordColumns
        .map((column) => `"${column}"::text AS "pw__${column}"`)
        .join(", ");
      const roleSelectSql = roleColumn
        ? `, "${roleColumn}"::text AS user_role`
        : "";
      const roleIdSelectSql = roleIdColumn
        ? `, "${roleIdColumn}"::text AS user_role_id`
        : "";
      const userIdSelectSql = userIdColumn
        ? `, "${userIdColumn}"::text AS token_user_id`
        : "";
      const nameSelectSql = nameColumns
        .map((column) => `, "${column}"::text AS "nm__${column}"`)
        .join("");
      const phoneSelectSql = phoneColumns
        .map((column) => `, "${column}"::text AS "ph__${column}"`)
        .join("");

      const credentialQuery = `
        SELECT ${passwordSelectSql}${roleSelectSql}${roleIdSelectSql}${userIdSelectSql}${nameSelectSql}${phoneSelectSql}
        FROM "users"
        WHERE LOWER("${loginColumn}"::text) = LOWER($1)
        LIMIT 1;
      `;

      const credentialResult = await pool.query(credentialQuery, [email]);

      if (credentialResult.rowCount === 0) {
        return res.json({
          valid: false,
          reason: "User not found",
          email,
        });
      }

      const userRow = credentialResult.rows[0];
      const storedPassword = passwordColumns
        .map((column) => userRow[`pw__${column}`])
        .find(
          (value) =>
            value !== null &&
            value !== undefined &&
            String(value).trim() !== "",
        );
      const resolvedName = nameColumns
        .map((column) => userRow[`nm__${column}`])
        .find(
          (value) =>
            value !== null &&
            value !== undefined &&
            String(value).trim() !== "",
        );
      const resolvedPhone = phoneColumns
        .map((column) => userRow[`ph__${column}`])
        .find(
          (value) =>
            value !== null &&
            value !== undefined &&
            String(value).trim() !== "",
        );
      const resolvedUserId = userRow.token_user_id || null;
      const resolvedRole = await resolveUserRole({
        userRole: userRow.user_role,
        userRoleId: userRow.user_role_id,
      });
      const normalizedRole = String(resolvedRole || "")
        .trim()
        .toUpperCase();

      if (!storedPassword) {
        return res.status(500).json({
          error: "Failed to validate superadmin login",
          details: "No password value found for matched user",
        });
      }

      if (password !== String(storedPassword)) {
        return res.json({
          valid: false,
          reason: "Incorrect password",
          email,
          userId: resolvedUserId,
          role: resolvedRole,
          name: resolvedName || null,
          phone: resolvedPhone || null,
        });
      }

      if (normalizedRole !== "SUPERADMIN") {
        return res.status(403).json({
          error: "Forbidden",
          details: "Only SUPERADMIN can login via this endpoint",
        });
      }

      const token = jwt.sign(
        {
          email,
          userId: resolvedUserId,
          role: resolvedRole,
        },
        jwtSecret,
        { expiresIn: jwtExpiresIn },
      );

      return res.json({
        valid: true,
        email,
        userId: resolvedUserId,
        role: resolvedRole,
        name: resolvedName || null,
        phone: resolvedPhone || null,
        token,
      });
    } catch (error) {
      return res
        .status(500)
        .json(buildDbError(error, "Failed to validate superadmin login"));
    }
  }

  async function logout(req, res) {
    try {
      if (!req.token || !req.user) {
        return res.status(401).json({
          error: "Unauthorized",
          details: "Missing valid token",
        });
      }

      addTokenToBlacklist(req.token, req.user.exp);
      return res.json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (error) {
      return res.status(500).json(buildDbError(error, "Failed to logout"));
    }
  }

  return {
    validateLogin,
    superAdminLogin,
    logout,
  };
}

module.exports = {
  createAuthController,
};
