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

  return {
    addUser,
  };
}

module.exports = {
  createUserController,
};
