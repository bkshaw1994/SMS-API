function createInternalError(message, details) {
  const error = new Error(message);
  error.status = 500;
  error.details = details;
  return error;
}

function collectMissingColumns(requiredColumns) {
  return requiredColumns
    .filter(({ value }) => !value)
    .map(({ label }) => label);
}

function createUserDb({ pool, findFirstExistingColumn }) {
  async function resolveSchoolByCode(schoolCode) {
    const schoolCodeColumn = await findFirstExistingColumn(pool, "school", [
      "school_code",
      "schoolcode",
      "code",
    ]);
    const schoolPkColumn = await findFirstExistingColumn(pool, "school", [
      "school_id",
      "id",
    ]);

    if (!schoolCodeColumn) {
      const error = new Error("Failed to add user");
      error.status = 500;
      error.details = "No supported school code column found in table 'school'";
      throw error;
    }

    const schoolSelectPkSql = schoolPkColumn
      ? `, "${schoolPkColumn}"::text AS school_pk`
      : "";
    const schoolResult = await pool.query(
      `
        SELECT "${schoolCodeColumn}"::text AS school_code_value${schoolSelectPkSql}
        FROM "school"
        WHERE LOWER("${schoolCodeColumn}"::text) = LOWER($1)
        LIMIT 1;
      `,
      [schoolCode],
    );

    if (schoolResult.rowCount === 0) {
      const error = new Error("Invalid schoolCode");
      error.status = 400;
      error.details = "Provided schoolCode does not exist";
      throw error;
    }

    if (!schoolPkColumn || !schoolResult.rows[0].school_pk) {
      const error = new Error("Failed to add user");
      error.status = 500;
      error.details =
        "users table expects school_id but no supported school primary key column found in table 'school'";
      throw error;
    }

    return {
      schoolPkValue: schoolResult.rows[0].school_pk,
      schoolCodeValue: schoolResult.rows[0].school_code_value,
    };
  }

  async function resolveRoleIdByName(roleName) {
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
      const error = new Error("Failed to add user");
      error.status = 500;
      error.details = "Roles table not found (expected 'roles' or 'roles1')";
      throw error;
    }

    const rolesTableName = rolesTableResult.rows[0].table_name;
    const roleNameColumn = await findFirstExistingColumn(pool, rolesTableName, [
      "role",
      "role_name",
      "name",
      "title",
      "type",
    ]);
    const rolePkColumn = await findFirstExistingColumn(pool, rolesTableName, [
      "role_id",
      "id",
    ]);

    if (!roleNameColumn || !rolePkColumn) {
      const error = new Error("Failed to add user");
      error.status = 500;
      error.details =
        "No supported role name/id columns found in roles table for role lookup";
      throw error;
    }

    const roleLookupResult = await pool.query(
      `
        SELECT "${rolePkColumn}"::text AS resolved_role_id
        FROM "${rolesTableName}"
        WHERE UPPER("${roleNameColumn}"::text) = UPPER($1)
        LIMIT 1;
      `,
      [roleName],
    );

    if (roleLookupResult.rowCount === 0) {
      const error = new Error("Invalid role");
      error.status = 400;
      error.details = `${roleName} role not found`;
      throw error;
    }

    return roleLookupResult.rows[0].resolved_role_id;
  }

  async function createUser({
    schoolId,
    name,
    email,
    phone,
    status,
    role,
    roleId,
    createdBy,
    passwordHash,
    tempPasswordHash,
    mustChangePassword,
    resetToken,
    resetTokenExpires,
  }) {
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
    const roleTextColumn = await findFirstExistingColumn(pool, "users", [
      "role",
      "user_role",
      "role_name",
    ]);
    const passwordHashColumn = await findFirstExistingColumn(pool, "users", [
      "password_hash",
      "passwordhash",
      "password",
      "user_password",
      "passcode",
    ]);
    const tempPasswordHashColumn = await findFirstExistingColumn(
      pool,
      "users",
      ["temp_password_hash"],
    );
    const mustChangePasswordColumn = await findFirstExistingColumn(
      pool,
      "users",
      ["must_change_password"],
    );
    const resetTokenColumn = await findFirstExistingColumn(pool, "users", [
      "reset_token",
    ]);
    const resetTokenExpiresColumn = await findFirstExistingColumn(
      pool,
      "users",
      ["reset_token_expires"],
    );
    const createdByColumn = await findFirstExistingColumn(pool, "users", [
      "created_by",
      "createdby",
    ]);

    const requiredColumns = [
      { value: userSchoolIdColumn, label: "school_id" },
      { value: nameColumn, label: "name" },
      { value: emailColumn, label: "email" },
      { value: statusColumn, label: "status" },
      { value: passwordHashColumn, label: "password_hash" },
      { value: tempPasswordHashColumn, label: "temp_password_hash" },
      { value: mustChangePasswordColumn, label: "must_change_password" },
      { value: resetTokenColumn, label: "reset_token" },
      { value: resetTokenExpiresColumn, label: "reset_token_expires" },
      { value: createdByColumn, label: "created_by" },
      { value: roleIdColumn || roleTextColumn, label: "role_id OR role" },
    ];
    const missingColumns = collectMissingColumns(requiredColumns);

    if (missingColumns.length > 0) {
      throw createInternalError(
        "Failed to add user",
        `Required columns missing in users table: ${missingColumns.join(", ")}`,
      );
    }

    if (roleIdColumn && !roleId) {
      throw createInternalError(
        "Failed to add user",
        "role_id column exists but role id could not be resolved from roles table",
      );
    }

    const insertColumns = [
      `"${userSchoolIdColumn}"`,
      `"${nameColumn}"`,
      `"${emailColumn}"`,
      `"${statusColumn}"`,
      `"${passwordHashColumn}"`,
      `"${tempPasswordHashColumn}"`,
      `"${mustChangePasswordColumn}"`,
      `"${resetTokenColumn}"`,
      `"${resetTokenExpiresColumn}"`,
      `"${createdByColumn}"`,
    ];
    const insertValues = [
      schoolId,
      name,
      email,
      status,
      passwordHash,
      tempPasswordHash,
      mustChangePassword,
      resetToken,
      resetTokenExpires,
      createdBy,
    ];

    if (roleIdColumn) {
      insertColumns.push(`"${roleIdColumn}"`);
      insertValues.push(roleId);
    }

    if (phoneColumn && phone) {
      insertColumns.push(`"${phoneColumn}"`);
      insertValues.push(phone);
    }

    if (roleTextColumn) {
      insertColumns.push(`"${roleTextColumn}"`);
      insertValues.push(role);
    }

    const insertQuery = `
      INSERT INTO "users" (
        ${insertColumns.join(",\n        ")}
      )
      VALUES (${insertValues.map((_, index) => `$${index + 1}`).join(", ")})
      RETURNING *;
    `;

    const result = await pool.query(insertQuery, insertValues);
    return result.rows[0];
  }

  return {
    resolveSchoolByCode,
    resolveRoleIdByName,
    createUser,
  };
}

module.exports = {
  createUserDb,
};
