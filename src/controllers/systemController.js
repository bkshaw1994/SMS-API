const crypto = require("crypto");

const {
  LIST_PUBLIC_TABLES,
  FIND_SCHOOL_CODE_COLUMN,
  FIND_SCHOOL_PK_COLUMN,
  FIND_SCHOOL_NAME_COLUMN,
  FIND_SCHOOL_OWNER_COLUMN,
  FIND_SCHOOL_STATUS_COLUMN,
  FIND_SCHOOL_CREATED_BY_COLUMN,
  FIND_ROLES_TABLE,
  FIND_USERS_SCHOOL_ID_COLUMN,
  FIND_USERS_SCHOOL_CODE_COLUMN,
  FIND_USERS_NAME_COLUMN,
  FIND_USERS_EMAIL_COLUMN,
  FIND_USERS_PHONE_COLUMN,
  FIND_USERS_WHATSAPP_COLUMN,
  FIND_STUDENTS_SCHOOL_ID_COLUMN,
  FIND_STUDENTS_PK_COLUMN,
  FIND_SECTIONS_TABLE,
  FIND_SECTIONS_PK_COLUMN,
  FIND_SECTIONS_NAME_COLUMN,
  FIND_SECTIONS_CLASS_ID_COLUMN,
  FIND_STUDENT_ENROLLMENTS_TABLE,
  FIND_ENROLLMENTS_STUDENT_ID_COLUMN,
  FIND_CLASSES_PK_COLUMN,
  FIND_CLASSES_NAME_COLUMN,
  FIND_USERS_TABLE,
  FIND_USERS_ROLE_TEXT_COLUMN,
  FIND_USERS_ROLE_ID_COLUMN,
  FIND_ROLE_PK_IN_TABLE,
  FIND_ROLE_NAME_IN_TABLE,
  findSchoolByCodeQuery,
  listSchoolsForSuperAdminQuery,
  listStudentsForSchoolQuery,
  listSectionClassMappingsBySectionIdsQuery,
  listRolesQuery,
  listUsersForSchoolQuery,
} = require("../queries/systemQueries");

function createSystemController({ pool, buildDbError }) {
  function generateRandomPassword(length = 12) {
    const chars =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$%!";
    let password = "";
    for (let i = 0; i < length; i += 1) {
      password += chars[crypto.randomInt(chars.length)];
    }
    return password;
  }

  async function findFirstExistingColumn(tableName, columnCandidates) {
    const result = await pool.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = ANY($2)
        ORDER BY array_position($2::text[], column_name)
        LIMIT 1;
      `,
      [tableName, columnCandidates],
    );

    return result.rowCount > 0 ? result.rows[0].column_name : null;
  }

  function normalizeStatusForColumn(status, statusColumn) {
    const normalizedStatus = String(status || "ACTIVE")
      .trim()
      .toUpperCase();

    if (statusColumn === "is_active" || statusColumn === "active") {
      return normalizedStatus === "ACTIVE" || normalizedStatus === "TRUE";
    }

    return normalizedStatus;
  }

  async function resolveRoleIdByName(roleName) {
    const roleTableResult = await pool.query(FIND_ROLES_TABLE);

    if (roleTableResult.rowCount === 0) {
      return {
        error: {
          status: 500,
          payload: {
            error: "Failed to resolve role",
            details: "Roles table not found (expected 'roles' or 'roles1')",
          },
        },
      };
    }

    const roleTableName = roleTableResult.rows[0].table_name;
    const rolePkResult = await pool.query(FIND_ROLE_PK_IN_TABLE, [
      roleTableName,
    ]);
    const roleNameResult = await pool.query(FIND_ROLE_NAME_IN_TABLE, [
      roleTableName,
    ]);

    if (rolePkResult.rowCount === 0 || roleNameResult.rowCount === 0) {
      return {
        error: {
          status: 500,
          payload: {
            error: "Failed to resolve role",
            details: "No supported role id/name columns found in roles table",
          },
        },
      };
    }

    const roleIdLookup = await pool.query(
      `
        SELECT "${rolePkResult.rows[0].column_name}"::text AS resolved_role_id
        FROM "${roleTableName}"
        WHERE UPPER("${roleNameResult.rows[0].column_name}"::text) = UPPER($1)
        LIMIT 1;
      `,
      [roleName],
    );

    if (roleIdLookup.rowCount === 0) {
      return {
        error: {
          status: 400,
          payload: {
            error: "Invalid role mapping",
            details: `${roleName} role not found in roles table`,
          },
        },
      };
    }

    return {
      roleId: roleIdLookup.rows[0].resolved_role_id,
    };
  }

  async function health(req, res) {
    res.json({ status: "ok" });
  }

  async function dbHealth(req, res) {
    try {
      await pool.query("SELECT 1");
      res.json({ database: "connected" });
    } catch (error) {
      res.status(500).json(buildDbError(error, "Database connection failed"));
    }
  }

  async function tables(req, res) {
    try {
      const result = await pool.query(LIST_PUBLIC_TABLES);
      res.json({ tables: result.rows.map((row) => row.table_name) });
    } catch (error) {
      res.status(500).json(buildDbError(error, "Failed to list tables"));
    }
  }

  async function validateSchoolCode(req, res) {
    const schoolCode =
      typeof req.body?.schoolCode === "string"
        ? req.body.schoolCode.trim()
        : "";

    if (!schoolCode) {
      return res.status(400).json({ error: "schoolCode is required" });
    }

    try {
      const columnResult = await pool.query(FIND_SCHOOL_CODE_COLUMN);

      if (columnResult.rowCount === 0) {
        return res.status(500).json({
          error: "Failed to validate school code",
          details: "No supported school code column found in table 'school'",
        });
      }

      const schoolCodeColumn = columnResult.rows[0].column_name;
      const query = findSchoolByCodeQuery(schoolCodeColumn, null);
      const result = await pool.query(query, [schoolCode]);

      return res.json({
        valid: result.rowCount > 0,
        schoolCode,
      });
    } catch (error) {
      return res
        .status(500)
        .json(buildDbError(error, "Failed to validate school code"));
    }
  }

  async function roles(req, res) {
    try {
      const requesterRole = String(req.user?.role || "")
        .trim()
        .toUpperCase();
      const allowedRoleMap = {
        SUPERADMIN: ["OWNER"],
        OWNER: ["ITADMIN"],
        ITADMIN: ["TEACHER", "PARENT", "STUDENT"],
      };
      const allowedRoles = allowedRoleMap[requesterRole] || [];

      const tableResult = await pool.query(FIND_ROLES_TABLE);

      if (tableResult.rowCount === 0) {
        return res.status(404).json({
          error: "Roles table not found",
          details:
            "Expected table 'roles' (or fallback 'roles1') in public schema",
        });
      }

      const tableName = tableResult.rows[0].table_name;
      const rolesQuery = listRolesQuery(tableName);
      const rolesResult = await pool.query(rolesQuery);

      const filteredRoles = rolesResult.rows.filter((row) => {
        const roleValue =
          row.role ??
          row.role_name ??
          row.name ??
          row.title ??
          row.type ??
          null;
        if (roleValue === null || roleValue === undefined) {
          return false;
        }
        return allowedRoles.includes(String(roleValue).trim().toUpperCase());
      });

      return res.json({
        table: tableName,
        requestedByRole: requesterRole || null,
        count: filteredRoles.length,
        roles: filteredRoles,
      });
    } catch (error) {
      return res.status(500).json(buildDbError(error, "Failed to fetch roles"));
    }
  }

  async function superAdminSchools(req, res) {
    try {
      const requesterRole = String(req.user?.role || "")
        .trim()
        .toUpperCase();

      if (requesterRole !== "SUPERADMIN") {
        return res.status(403).json({
          error: "Forbidden",
          details: "Only SUPERADMIN can access this endpoint",
        });
      }

      const schoolNameResult = await pool.query(FIND_SCHOOL_NAME_COLUMN);
      const schoolCodeResult = await pool.query(FIND_SCHOOL_CODE_COLUMN);
      const statusResult = await pool.query(FIND_SCHOOL_STATUS_COLUMN);
      const createdByResult = await pool.query(FIND_SCHOOL_CREATED_BY_COLUMN);

      if (schoolNameResult.rowCount === 0 || schoolCodeResult.rowCount === 0) {
        return res.status(500).json({
          error: "Failed to list schools",
          details:
            "No supported school name/code columns found in table 'school'",
        });
      }

      const schoolsQuery = listSchoolsForSuperAdminQuery({
        schoolNameColumn: schoolNameResult.rows[0].column_name,
        schoolCodeColumn: schoolCodeResult.rows[0].column_name,
        ownerColumn: null,
        statusColumn:
          statusResult.rowCount > 0 ? statusResult.rows[0].column_name : null,
        createdByColumn:
          createdByResult.rowCount > 0
            ? createdByResult.rows[0].column_name
            : null,
      });

      const schoolsResult = await pool.query(schoolsQuery);
      const schoolsWithOwnerFromUsers = [];

      // Owner is sourced from users table by OWNER role for each school.
      for (const school of schoolsResult.rows) {
        const schoolCode =
          typeof school.school_code === "string"
            ? school.school_code.trim()
            : "";

        if (!schoolCode) {
          schoolsWithOwnerFromUsers.push({
            ...school,
            owner: [],
          });
          continue;
        }

        const ownerLookup = await listUsersByRolesForSchool({
          schoolCode,
          allowedRoles: ["OWNER"],
        });

        if (ownerLookup.error) {
          return res
            .status(ownerLookup.error.status)
            .json(ownerLookup.error.payload);
        }

        const ownerNames = ownerLookup.users
          .map((user) =>
            typeof user.name === "string" ? user.name.trim() : "",
          )
          .filter((name) => name.length > 0);

        schoolsWithOwnerFromUsers.push({
          ...school,
          owner: ownerNames,
        });
      }

      return res.json({
        count: schoolsWithOwnerFromUsers.length,
        schools: schoolsWithOwnerFromUsers,
      });
    } catch (error) {
      return res
        .status(500)
        .json(buildDbError(error, "Failed to list schools"));
    }
  }

  async function superAdminAddSchool(req, res) {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({
        error: "Forbidden",
        details: "Only SUPERADMIN can access this endpoint",
      });
    }

    const schoolName =
      typeof req.body?.schoolName === "string"
        ? req.body.schoolName.trim()
        : "";
    const schoolCode =
      typeof req.body?.schoolCode === "string" ||
      typeof req.body?.schoolCode === "number"
        ? String(req.body.schoolCode).trim()
        : "";
    const address =
      typeof req.body?.address === "string" ? req.body.address.trim() : "";
    const number =
      typeof req.body?.number === "string" ||
      typeof req.body?.number === "number"
        ? String(req.body.number).trim()
        : "";
    const website =
      typeof req.body?.website === "string" ? req.body.website.trim() : "";
    const city = typeof req.body?.city === "string" ? req.body.city.trim() : "";
    const state =
      typeof req.body?.state === "string" ? req.body.state.trim() : "";
    const schoolEmail =
      typeof req.body?.schoolEmail === "string"
        ? req.body.schoolEmail.trim()
        : typeof req.body?.schoolEmailId === "string"
          ? req.body.schoolEmailId.trim()
          : typeof req.body?.schhoolEmail === "string"
            ? req.body.schhoolEmail.trim()
            : typeof req.body?.schhoolEmailId === "string"
              ? req.body.schhoolEmailId.trim()
              : "";
    const logoImage =
      typeof req.body?.logoImage === "string" ? req.body.logoImage.trim() : "";
    const status =
      typeof req.body?.status === "string" ||
      typeof req.body?.status === "number"
        ? String(req.body.status).trim()
        : "ACTIVE";

    if (
      !schoolName ||
      !schoolCode ||
      !address ||
      !number ||
      !website ||
      !city ||
      !state ||
      !schoolEmail
    ) {
      return res.status(400).json({
        error:
          "schoolName, schoolCode, address, number, website, city, state, and schoolEmail are required",
      });
    }

    try {
      const schoolCodeResult = await pool.query(FIND_SCHOOL_CODE_COLUMN);
      const schoolNameResult = await pool.query(FIND_SCHOOL_NAME_COLUMN);
      const schoolStatusResult = await pool.query(FIND_SCHOOL_STATUS_COLUMN);
      const schoolCreatedByResult = await pool.query(
        FIND_SCHOOL_CREATED_BY_COLUMN,
      );

      if (schoolCodeResult.rowCount === 0 || schoolNameResult.rowCount === 0) {
        return res.status(500).json({
          error: "Failed to add school",
          details:
            "No supported school name/code columns found in table 'school'",
        });
      }

      const schoolCodeColumn = schoolCodeResult.rows[0].column_name;
      const schoolNameColumn = schoolNameResult.rows[0].column_name;
      const schoolStatusColumn =
        schoolStatusResult.rowCount > 0
          ? schoolStatusResult.rows[0].column_name
          : null;
      const schoolCreatedByColumn =
        schoolCreatedByResult.rowCount > 0
          ? schoolCreatedByResult.rows[0].column_name
          : null;

      const existingSchoolResult = await pool.query(
        findSchoolByCodeQuery(schoolCodeColumn, null),
        [schoolCode],
      );

      if (existingSchoolResult.rowCount > 0) {
        return res.status(409).json({
          error: "School already exists",
          schoolCode,
        });
      }

      const addressColumn = await findFirstExistingColumn("school", [
        "address",
        "school_address",
        "location",
      ]);
      const numberColumn = await findFirstExistingColumn("school", [
        "number",
        "phone",
        "contact_no",
        "contact_number",
        "mobile",
        "phone_number",
      ]);
      const websiteColumn = await findFirstExistingColumn("school", [
        "website",
        "school_website",
        "web_site",
        "url",
      ]);
      const cityColumn = await findFirstExistingColumn("school", [
        "city",
        "school_city",
      ]);
      const stateColumn = await findFirstExistingColumn("school", [
        "state",
        "school_state",
        "province",
      ]);
      const schoolEmailColumn = await findFirstExistingColumn("school", [
        "school_email",
        "school_email_id",
        "email",
        "email_id",
        "mail",
      ]);
      const logoColumn = await findFirstExistingColumn("school", [
        "logo_image",
        "logo",
        "logo_url",
        "school_logo",
        "image",
      ]);

      const missingColumns = [];
      if (!addressColumn) {
        missingColumns.push("address");
      }
      if (!numberColumn) {
        missingColumns.push("number");
      }
      if (!websiteColumn) {
        missingColumns.push("website");
      }
      if (!cityColumn) {
        missingColumns.push("city");
      }
      if (!stateColumn) {
        missingColumns.push("state");
      }
      if (!schoolEmailColumn) {
        missingColumns.push("schoolEmail");
      }
      if (logoImage && !logoColumn) {
        missingColumns.push("logoImage");
      }

      if (missingColumns.length > 0) {
        return res.status(500).json({
          error: "Failed to add school",
          details: `Required columns not found in table 'school' for: ${missingColumns.join(", ")}`,
        });
      }

      const columns = [
        `"${schoolNameColumn}"`,
        `"${schoolCodeColumn}"`,
        `"${addressColumn}"`,
        `"${numberColumn}"`,
        `"${websiteColumn}"`,
        `"${cityColumn}"`,
        `"${stateColumn}"`,
        `"${schoolEmailColumn}"`,
      ];
      const values = [
        schoolName,
        schoolCode,
        address,
        number,
        website,
        city,
        state,
        schoolEmail,
      ];

      if (logoImage && logoColumn) {
        columns.push(`"${logoColumn}"`);
        values.push(logoImage);
      }

      if (schoolStatusColumn) {
        columns.push(`"${schoolStatusColumn}"`);
        values.push(normalizeStatusForColumn(status, schoolStatusColumn));
      }

      if (schoolCreatedByColumn) {
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

        columns.push(`"${schoolCreatedByColumn}"`);
        values.push(createdBy);
      }

      const valuePlaceholders = values
        .map((_, index) => `$${index + 1}`)
        .join(", ");
      const insertQuery = `
        INSERT INTO "school" (${columns.join(", ")})
        VALUES (${valuePlaceholders})
        RETURNING *;
      `;

      const insertResult = await pool.query(insertQuery, values);

      return res.status(201).json({
        success: true,
        message: "School added successfully",
        school: insertResult.rows[0],
      });
    } catch (error) {
      return res.status(500).json(buildDbError(error, "Failed to add school"));
    }
  }

  async function superAdminAddOwner(req, res) {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({
        error: "Forbidden",
        details: "Only SUPERADMIN can access this endpoint",
      });
    }

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

    if (!schoolCode || !name || !email || !phone) {
      return res.status(400).json({
        error: "schoolCode, name, email, and phone are required",
      });
    }

    try {
      const schoolResolved = await resolveSchoolForParamCode(schoolCode);
      if (schoolResolved.error) {
        return res
          .status(schoolResolved.error.status)
          .json(schoolResolved.error.payload);
      }

      const usersTableResult = await pool.query(FIND_USERS_TABLE);
      if (usersTableResult.rowCount === 0) {
        return res.status(500).json({
          error: "Failed to add owner",
          details: "Table 'users' not found",
        });
      }

      const userSchoolIdColumn = await findFirstExistingColumn("users", [
        "school_id",
        "schoolid",
      ]);
      const userSchoolCodeColumn = await findFirstExistingColumn("users", [
        "school_code",
        "schoolcode",
        "code",
      ]);
      const userNameColumn = await findFirstExistingColumn("users", [
        "name",
        "full_name",
        "user_name",
        "username",
      ]);
      const userEmailColumn = await findFirstExistingColumn("users", [
        "email",
        "email_id",
        "mail",
      ]);
      const userPhoneColumn = await findFirstExistingColumn("users", [
        "phone",
        "mobile",
        "phone_number",
        "contact_no",
        "whatsapp",
      ]);
      const userStatusColumn = await findFirstExistingColumn("users", [
        "status",
        "user_status",
      ]);
      const userRoleIdColumn = await findFirstExistingColumn("users", [
        "role_id",
        "roleid",
      ]);
      const userRoleTextColumn = await findFirstExistingColumn("users", [
        "role",
        "user_role",
        "role_name",
      ]);
      const userCreatedByColumn = await findFirstExistingColumn("users", [
        "created_by",
        "createdby",
      ]);
      const userIdColumn = await findFirstExistingColumn("users", [
        "user_id",
        "id",
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

      if (!userNameColumn || !userEmailColumn || !userPhoneColumn) {
        return res.status(500).json({
          error: "Failed to add owner",
          details:
            "Required user columns not found. Expected name, email, and phone columns in 'users' table",
        });
      }

      if (!userRoleIdColumn && !userRoleTextColumn) {
        return res.status(500).json({
          error: "Failed to add owner",
          details: "No supported role column found in table 'users'",
        });
      }

      if (passwordColumns.length === 0) {
        return res.status(500).json({
          error: "Failed to add owner",
          details: "No supported password columns found in table 'users'",
        });
      }

      const ownerPassword = generateRandomPassword();

      const duplicateSchoolColumn =
        userSchoolIdColumn && schoolResolved.schoolPkValue
          ? userSchoolIdColumn
          : userSchoolCodeColumn;
      const duplicateSchoolValue =
        duplicateSchoolColumn === userSchoolIdColumn
          ? schoolResolved.schoolPkValue
          : schoolResolved.schoolCodeValue;

      if (duplicateSchoolColumn && duplicateSchoolValue) {
        const duplicateResult = await pool.query(
          `
            SELECT 1
            FROM "users"
            WHERE "${duplicateSchoolColumn}"::text = $1::text
              AND LOWER("${userEmailColumn}"::text) = LOWER($2)
            LIMIT 1;
          `,
          [duplicateSchoolValue, email],
        );

        if (duplicateResult.rowCount > 0) {
          return res.status(409).json({
            error: "Owner already exists for this school with same email",
            schoolCode: schoolResolved.schoolCodeValue,
            email,
          });
        }
      }

      const insertColumns = [];
      const insertValues = [];

      if (userSchoolIdColumn && schoolResolved.schoolPkValue) {
        insertColumns.push(`"${userSchoolIdColumn}"`);
        insertValues.push(schoolResolved.schoolPkValue);
      }

      if (userSchoolCodeColumn) {
        insertColumns.push(`"${userSchoolCodeColumn}"`);
        insertValues.push(schoolResolved.schoolCodeValue);
      }

      if (insertColumns.length === 0) {
        return res.status(500).json({
          error: "Failed to add owner",
          details:
            "Unable to resolve users school mapping using school_id or school_code",
        });
      }

      insertColumns.push(`"${userNameColumn}"`);
      insertValues.push(name);

      insertColumns.push(`"${userEmailColumn}"`);
      insertValues.push(email);

      insertColumns.push(`"${userPhoneColumn}"`);
      insertValues.push(phone);

      if (userStatusColumn) {
        insertColumns.push(`"${userStatusColumn}"`);
        insertValues.push(normalizeStatusForColumn(status, userStatusColumn));
      }

      if (userRoleIdColumn) {
        const resolvedRole = await resolveRoleIdByName("OWNER");
        if (resolvedRole.error) {
          return res
            .status(resolvedRole.error.status)
            .json(resolvedRole.error.payload);
        }

        insertColumns.push(`"${userRoleIdColumn}"`);
        insertValues.push(resolvedRole.roleId);
      }

      if (userRoleTextColumn) {
        insertColumns.push(`"${userRoleTextColumn}"`);
        insertValues.push("OWNER");
      }

      passwordColumns.forEach((column) => {
        insertColumns.push(`"${column}"`);
        insertValues.push(ownerPassword);
      });

      if (userCreatedByColumn) {
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

        insertColumns.push(`"${userCreatedByColumn}"`);
        insertValues.push(createdBy);
      }

      const placeholders = insertValues
        .map((_, index) => `$${index + 1}`)
        .join(", ");
      const ownerInsertResult = await pool.query(
        `
          INSERT INTO "users" (${insertColumns.join(", ")})
          VALUES (${placeholders})
          RETURNING *;
        `,
        insertValues,
      );

      const createdOwner = ownerInsertResult.rows[0];

      const schoolOwnerColumnResult = await pool.query(
        FIND_SCHOOL_OWNER_COLUMN,
      );
      if (schoolOwnerColumnResult.rowCount > 0) {
        const schoolOwnerColumn = schoolOwnerColumnResult.rows[0].column_name;
        let ownerValue = name;

        if (
          (schoolOwnerColumn === "owner_id" ||
            schoolOwnerColumn === "ownerid") &&
          userIdColumn
        ) {
          ownerValue =
            createdOwner[userIdColumn] !== undefined &&
            createdOwner[userIdColumn] !== null
              ? String(createdOwner[userIdColumn])
              : ownerValue;
        }

        await pool.query(
          `
            UPDATE "school"
            SET "${schoolOwnerColumn}" = $1
            WHERE "${schoolResolved.schoolCodeColumn}"::text = $2::text;
          `,
          [ownerValue, schoolResolved.schoolCodeValue],
        );
      }

      return res.status(201).json({
        success: true,
        message: "Owner added successfully",
        schoolCode: schoolResolved.schoolCodeValue,
        generatedPassword: ownerPassword,
        owner: createdOwner,
      });
    } catch (error) {
      return res.status(500).json(buildDbError(error, "Failed to add owner"));
    }
  }

  function isSuperAdmin(req) {
    const requesterRole = String(req.user?.role || "")
      .trim()
      .toUpperCase();
    return requesterRole === "SUPERADMIN";
  }

  async function resolveSchoolForParamCode(schoolCode) {
    const schoolColumnResult = await pool.query(FIND_SCHOOL_CODE_COLUMN);
    const schoolPkResult = await pool.query(FIND_SCHOOL_PK_COLUMN);

    if (schoolColumnResult.rowCount === 0) {
      return {
        error: {
          status: 500,
          payload: {
            error: "Failed to resolve school",
            details: "No supported school code column found in table 'school'",
          },
        },
      };
    }

    const schoolCodeColumn = schoolColumnResult.rows[0].column_name;
    const schoolPkColumn =
      schoolPkResult.rowCount > 0 ? schoolPkResult.rows[0].column_name : null;

    const schoolResult = await pool.query(
      findSchoolByCodeQuery(schoolCodeColumn, schoolPkColumn),
      [schoolCode],
    );

    if (schoolResult.rowCount === 0) {
      return {
        error: {
          status: 404,
          payload: {
            error: "School not found",
            schoolCode,
          },
        },
      };
    }

    return {
      schoolCodeColumn,
      schoolPkColumn,
      schoolCodeValue: schoolResult.rows[0].school_code_value,
      schoolPkValue: schoolPkColumn ? schoolResult.rows[0].school_pk : null,
    };
  }

  async function resolveUserRoleLookup() {
    const roleTableResult = await pool.query(FIND_ROLES_TABLE);

    if (roleTableResult.rowCount === 0) {
      return null;
    }

    const roleTableName = roleTableResult.rows[0].table_name;
    const rolePkResult = await pool.query(FIND_ROLE_PK_IN_TABLE, [
      roleTableName,
    ]);
    const roleNameResult = await pool.query(FIND_ROLE_NAME_IN_TABLE, [
      roleTableName,
    ]);

    if (rolePkResult.rowCount === 0 || roleNameResult.rowCount === 0) {
      return null;
    }

    return {
      roleTableName,
      rolePkColumn: rolePkResult.rows[0].column_name,
      roleNameColumn: roleNameResult.rows[0].column_name,
    };
  }

  async function listUsersByRolesForSchool({ schoolCode, allowedRoles }) {
    const usersTableResult = await pool.query(FIND_USERS_TABLE);
    if (usersTableResult.rowCount === 0) {
      return {
        error: {
          status: 500,
          payload: {
            error: "Failed to list users",
            details: "Table 'users' not found",
          },
        },
      };
    }

    const schoolResolved = await resolveSchoolForParamCode(schoolCode);
    if (schoolResolved.error) {
      return schoolResolved;
    }

    const userSchoolIdResult = await pool.query(FIND_USERS_SCHOOL_ID_COLUMN);
    const userSchoolCodeResult = await pool.query(
      FIND_USERS_SCHOOL_CODE_COLUMN,
    );
    const userNameResult = await pool.query(FIND_USERS_NAME_COLUMN);
    const userEmailResult = await pool.query(FIND_USERS_EMAIL_COLUMN);
    const userPhoneResult = await pool.query(FIND_USERS_PHONE_COLUMN);
    const userWhatsappResult = await pool.query(FIND_USERS_WHATSAPP_COLUMN);
    const userRoleTextResult = await pool.query(FIND_USERS_ROLE_TEXT_COLUMN);
    const userRoleIdResult = await pool.query(FIND_USERS_ROLE_ID_COLUMN);

    let filterColumn = null;
    let filterValue = null;

    if (userSchoolIdResult.rowCount > 0 && schoolResolved.schoolPkColumn) {
      filterColumn = userSchoolIdResult.rows[0].column_name;
      filterValue = schoolResolved.schoolPkValue;
    } else if (userSchoolCodeResult.rowCount > 0) {
      filterColumn = userSchoolCodeResult.rows[0].column_name;
      filterValue = schoolResolved.schoolCodeValue;
    }

    if (!filterColumn || filterValue === null || filterValue === undefined) {
      return {
        error: {
          status: 500,
          payload: {
            error: "Failed to list users",
            details:
              "Unable to resolve users school mapping using school_id or school_code",
          },
        },
      };
    }

    const userNameColumn =
      userNameResult.rowCount > 0 ? userNameResult.rows[0].column_name : null;
    const userEmailColumn =
      userEmailResult.rowCount > 0 ? userEmailResult.rows[0].column_name : null;
    const userPhoneColumn =
      userPhoneResult.rowCount > 0 ? userPhoneResult.rows[0].column_name : null;
    const userWhatsappColumn =
      userWhatsappResult.rowCount > 0
        ? userWhatsappResult.rows[0].column_name
        : null;
    const userRoleTextColumn =
      userRoleTextResult.rowCount > 0
        ? userRoleTextResult.rows[0].column_name
        : null;
    const userRoleIdColumn =
      userRoleIdResult.rowCount > 0
        ? userRoleIdResult.rows[0].column_name
        : null;

    if (!userRoleTextColumn && !userRoleIdColumn) {
      return {
        error: {
          status: 500,
          payload: {
            error: "Failed to list users",
            details: "No supported role column found in table 'users'",
          },
        },
      };
    }

    let roleJoinSql = "";
    let roleSelectSql = "";
    if (userRoleIdColumn) {
      const roleLookup = await resolveUserRoleLookup();
      if (!roleLookup) {
        return {
          error: {
            status: 500,
            payload: {
              error: "Failed to list users",
              details: "No supported role mapping found for role_id resolution",
            },
          },
        };
      }

      roleJoinSql = ` LEFT JOIN "${roleLookup.roleTableName}" r ON r."${roleLookup.rolePkColumn}"::text = u."${userRoleIdColumn}"::text`;
      roleSelectSql = `r."${roleLookup.roleNameColumn}"::text AS role`;
    } else {
      roleSelectSql = `u."${userRoleTextColumn}"::text AS role`;
    }

    const nameSelectSql = userNameColumn
      ? `u."${userNameColumn}"::text AS name`
      : `NULL::text AS name`;
    const emailSelectSql = userEmailColumn
      ? `u."${userEmailColumn}"::text AS email`
      : `NULL::text AS email`;
    const phoneSelectSql = userPhoneColumn
      ? `u."${userPhoneColumn}"::text AS phone`
      : `NULL::text AS phone`;
    const whatsappSelectSql = userWhatsappColumn
      ? `u."${userWhatsappColumn}"::text AS whatsapp`
      : `NULL::text AS whatsapp`;

    const usersQuery = listUsersForSchoolQuery({
      nameSelectSql,
      emailSelectSql,
      phoneSelectSql,
      whatsappSelectSql,
      roleSelectSql,
      roleJoinSql,
      filterColumn,
    });
    const usersResult = await pool.query(usersQuery, [filterValue]);
    const normalizedAllowedRoles = allowedRoles.map((role) =>
      String(role).trim().toUpperCase(),
    );

    const users = usersResult.rows.filter((user) => {
      const role = String(user.role || "")
        .trim()
        .toUpperCase();
      return normalizedAllowedRoles.includes(role);
    });

    return {
      schoolCode: schoolResolved.schoolCodeValue,
      users,
    };
  }

  async function superAdminStudentsClasswise(req, res) {
    const requestedSchoolCode =
      typeof req.params?.schoolCode === "string"
        ? req.params.schoolCode.trim()
        : "";
    const tokenSchoolCode =
      typeof req.user?.schoolCode === "string"
        ? req.user.schoolCode.trim()
        : "";
    const requesterRole = String(req.user?.role || "")
      .trim()
      .toUpperCase();

    const schoolCode = tokenSchoolCode || requestedSchoolCode;

    if (!schoolCode) {
      return res.status(400).json({
        error: "schoolCode is required",
        details:
          "School code was not found in JWT token and no schoolCode param was provided",
      });
    }

    if (
      requesterRole !== "SUPERADMIN" &&
      requestedSchoolCode &&
      tokenSchoolCode &&
      requestedSchoolCode.toUpperCase() !== tokenSchoolCode.toUpperCase()
    ) {
      return res.status(403).json({
        error: "Forbidden",
        details: "You can only access classwise data for your own school",
      });
    }

    try {
      const schoolResolved = await resolveSchoolForParamCode(schoolCode);
      if (schoolResolved.error) {
        return res
          .status(schoolResolved.error.status)
          .json(schoolResolved.error.payload);
      }

      const studentSchoolIdResult = await pool.query(
        FIND_STUDENTS_SCHOOL_ID_COLUMN,
      );

      if (
        studentSchoolIdResult.rowCount === 0 ||
        !schoolResolved.schoolPkColumn ||
        schoolResolved.schoolPkValue === null ||
        schoolResolved.schoolPkValue === undefined
      ) {
        return res.status(500).json({
          error: "Failed to list students",
          details:
            "Unable to resolve students school_id mapping from JWT school context",
        });
      }

      const filterColumn = studentSchoolIdResult.rows[0].column_name;
      const filterValue = schoolResolved.schoolPkValue;

      const studentsQuery = listStudentsForSchoolQuery(filterColumn);
      const studentsResult = await pool.query(studentsQuery, [filterValue]);

      const studentPkResult = await pool.query(FIND_STUDENTS_PK_COLUMN);
      const enrollmentsTableResult = await pool.query(
        FIND_STUDENT_ENROLLMENTS_TABLE,
      );
      const enrollmentStudentIdResult = await pool.query(
        FIND_ENROLLMENTS_STUDENT_ID_COLUMN,
      );
      const enrollmentSectionIdColumn = await findFirstExistingColumn(
        "student_enrollments",
        ["section_id", "sectionid"],
      );

      const studentPkColumn =
        studentPkResult.rowCount > 0
          ? studentPkResult.rows[0].column_name
          : null;

      const enrollmentStudentIdColumn =
        enrollmentStudentIdResult.rowCount > 0
          ? enrollmentStudentIdResult.rows[0].column_name
          : null;

      if (
        !studentPkColumn ||
        enrollmentsTableResult.rowCount === 0 ||
        !enrollmentStudentIdColumn ||
        !enrollmentSectionIdColumn
      ) {
        return res.status(500).json({
          error: "Failed to list students class wise",
          details:
            "No supported section mapping found via student_enrollments using student_id",
        });
      }

      const studentIds = Array.from(
        new Set(
          studentsResult.rows
            .map((student) => String(student[studentPkColumn] || "").trim())
            .filter((value) => value.length > 0),
        ),
      );

      if (studentIds.length === 0) {
        return res.json({
          schoolCode: schoolResolved.schoolCodeValue,
          schoolId: schoolResolved.schoolPkValue,
          sectionIdColumn: enrollmentSectionIdColumn,
          sectionSource: "student_enrollments.section_id via student_id",
          totalStudents: 0,
          classSectionSummary: [],
          classes: [],
        });
      }

      const enrollmentMappingsResult = await pool.query(
        `
          SELECT
            "${enrollmentStudentIdColumn}"::text AS student_id_value,
            "${enrollmentSectionIdColumn}"::text AS class_value
          FROM "student_enrollments"
          WHERE "${enrollmentStudentIdColumn}"::text = ANY($1::text[]);
        `,
        [studentIds],
      );

      const sectionByStudentIdMap = enrollmentMappingsResult.rows.reduce(
        (acc, row) => {
          const studentIdValue = String(row.student_id_value || "").trim();
          const sectionIdValue = String(row.class_value || "").trim();
          if (studentIdValue && sectionIdValue && !acc[studentIdValue]) {
            acc[studentIdValue] = sectionIdValue;
          }
          return acc;
        },
        {},
      );
      const sectionSource = "student_enrollments.section_id via student_id";

      const sectionsTableResult = await pool.query(FIND_SECTIONS_TABLE);
      const sectionPkResult = await pool.query(FIND_SECTIONS_PK_COLUMN);
      const sectionNameResult = await pool.query(FIND_SECTIONS_NAME_COLUMN);
      const sectionClassIdResult = await pool.query(
        FIND_SECTIONS_CLASS_ID_COLUMN,
      );
      const classPkResult = await pool.query(FIND_CLASSES_PK_COLUMN);
      const classNameResult = await pool.query(FIND_CLASSES_NAME_COLUMN);

      if (sectionsTableResult.rowCount === 0) {
        return res.status(500).json({
          error: "Failed to list students class wise",
          details: "Table 'sections' not found",
        });
      }

      if (
        sectionPkResult.rowCount === 0 ||
        sectionNameResult.rowCount === 0 ||
        sectionClassIdResult.rowCount === 0
      ) {
        return res.status(500).json({
          error: "Failed to list students class wise",
          details:
            "No supported section id/name/class mapping columns found in table 'sections'",
        });
      }

      if (classPkResult.rowCount === 0 || classNameResult.rowCount === 0) {
        return res.status(500).json({
          error: "Failed to list students class wise",
          details:
            "No supported class id/name columns found in table 'classes'",
        });
      }

      const sectionIds = Array.from(
        new Set(
          studentsResult.rows
            .map((student) =>
              studentPkColumn
                ? String(
                    sectionByStudentIdMap?.[
                      String(student[studentPkColumn] || "").trim()
                    ] || "",
                  ).trim()
                : "",
            )
            .filter((value) => value.length > 0),
        ),
      );

      let sectionClassMap = {};

      if (sectionIds.length > 0) {
        const sectionClassMappingsResult = await pool.query(
          listSectionClassMappingsBySectionIdsQuery({
            sectionPkColumn: sectionPkResult.rows[0].column_name,
            sectionNameColumn: sectionNameResult.rows[0].column_name,
            sectionClassIdColumn: sectionClassIdResult.rows[0].column_name,
            classPkColumn: classPkResult.rows[0].column_name,
            classNameColumn: classNameResult.rows[0].column_name,
          }),
          [sectionIds],
        );

        sectionClassMap = sectionClassMappingsResult.rows.reduce((acc, row) => {
          const sectionId = String(row.section_id_value || "").trim();
          if (!sectionId || acc[sectionId]) {
            return acc;
          }

          acc[sectionId] = {
            sectionName:
              row.section_name_value === null ||
              row.section_name_value === undefined
                ? null
                : String(row.section_name_value).trim() || null,
            className:
              row.class_name_value === null ||
              row.class_name_value === undefined
                ? null
                : String(row.class_name_value).trim() || null,
          };
          return acc;
        }, {});
      }

      const groupedByClassAndSection = new Map();

      studentsResult.rows.forEach((student) => {
        const sectionId = studentPkColumn
          ? String(
              sectionByStudentIdMap?.[
                String(student[studentPkColumn] || "").trim()
              ] || "",
            ).trim()
          : "";

        const sectionData = sectionId ? sectionClassMap[sectionId] : null;
        const className =
          sectionData && sectionData.className
            ? sectionData.className
            : "UNASSIGNED_CLASS";
        const sectionName =
          sectionData && sectionData.sectionName
            ? sectionData.sectionName
            : "UNASSIGNED_SECTION";

        const groupKey = `${className}::${sectionName}`;
        if (!groupedByClassAndSection.has(groupKey)) {
          groupedByClassAndSection.set(groupKey, {
            className,
            sectionName,
            sectionId: sectionId || null,
            count: 0,
            students: [],
          });
        }

        const group = groupedByClassAndSection.get(groupKey);
        group.count += 1;
        group.students.push(student);
      });

      const groupedRows = Array.from(groupedByClassAndSection.values()).sort(
        (a, b) => {
          const classCompare = a.className.localeCompare(b.className);
          if (classCompare !== 0) {
            return classCompare;
          }
          return a.sectionName.localeCompare(b.sectionName);
        },
      );

      const classesMap = new Map();
      groupedRows.forEach((row) => {
        if (!classesMap.has(row.className)) {
          classesMap.set(row.className, {
            className: row.className,
            count: 0,
            sections: [],
          });
        }

        const classGroup = classesMap.get(row.className);
        classGroup.count += row.count;
        classGroup.sections.push({
          sectionId: row.sectionId,
          sectionName: row.sectionName,
          count: row.count,
        });
      });

      const classes = Array.from(classesMap.values());
      const classSectionSummary = groupedRows.map((row) => ({
        className: row.className,
        sectionId: row.sectionId,
        sectionName: row.sectionName,
        count: row.count,
      }));

      return res.json({
        schoolCode: schoolResolved.schoolCodeValue,
        schoolId: schoolResolved.schoolPkValue,
        sectionIdColumn: enrollmentSectionIdColumn,
        sectionSource,
        totalStudents: studentsResult.rowCount,
        classSectionSummary,
        classes,
      });
    } catch (error) {
      return res
        .status(500)
        .json(buildDbError(error, "Failed to list students class wise"));
    }
  }

  async function superAdminTeachers(req, res) {
    const schoolCode =
      typeof req.params?.schoolCode === "string"
        ? req.params.schoolCode.trim()
        : "";

    if (!isSuperAdmin(req)) {
      return res.status(403).json({
        error: "Forbidden",
        details: "Only SUPERADMIN can access this endpoint",
      });
    }

    if (!schoolCode) {
      return res.status(400).json({ error: "schoolCode param is required" });
    }

    try {
      const result = await listUsersByRolesForSchool({
        schoolCode,
        allowedRoles: ["TEACHER"],
      });
      if (result.error) {
        return res.status(result.error.status).json(result.error.payload);
      }

      return res.json({
        schoolCode: result.schoolCode,
        count: result.users.length,
        teachers: result.users,
      });
    } catch (error) {
      return res
        .status(500)
        .json(buildDbError(error, "Failed to list teacher details"));
    }
  }

  async function superAdminParents(req, res) {
    const schoolCode =
      typeof req.params?.schoolCode === "string"
        ? req.params.schoolCode.trim()
        : "";

    if (!isSuperAdmin(req)) {
      return res.status(403).json({
        error: "Forbidden",
        details: "Only SUPERADMIN can access this endpoint",
      });
    }

    if (!schoolCode) {
      return res.status(400).json({ error: "schoolCode param is required" });
    }

    try {
      const result = await listUsersByRolesForSchool({
        schoolCode,
        allowedRoles: ["PARENT"],
      });
      if (result.error) {
        return res.status(result.error.status).json(result.error.payload);
      }

      return res.json({
        schoolCode: result.schoolCode,
        count: result.users.length,
        parents: result.users,
      });
    } catch (error) {
      return res
        .status(500)
        .json(buildDbError(error, "Failed to list parent details"));
    }
  }

  async function superAdminOwnerAndItAdmin(req, res) {
    const schoolCode =
      typeof req.params?.schoolCode === "string"
        ? req.params.schoolCode.trim()
        : "";

    if (!isSuperAdmin(req)) {
      return res.status(403).json({
        error: "Forbidden",
        details: "Only SUPERADMIN can access this endpoint",
      });
    }

    if (!schoolCode) {
      return res.status(400).json({ error: "schoolCode param is required" });
    }

    try {
      const result = await listUsersByRolesForSchool({
        schoolCode,
        allowedRoles: ["OWNER", "ITADMIN"],
      });
      if (result.error) {
        return res.status(result.error.status).json(result.error.payload);
      }

      const owners = result.users.filter(
        (user) =>
          String(user.role || "")
            .trim()
            .toUpperCase() === "OWNER",
      );
      const itadmins = result.users.filter(
        (user) =>
          String(user.role || "")
            .trim()
            .toUpperCase() === "ITADMIN",
      );

      return res.json({
        schoolCode: result.schoolCode,
        count: result.users.length,
        ownerCount: owners.length,
        itadminCount: itadmins.length,
        owners,
        itadmins,
        users: result.users,
      });
    } catch (error) {
      return res
        .status(500)
        .json(buildDbError(error, "Failed to list owner and ITADMIN users"));
    }
  }

  async function itAdminUsers(req, res) {
    try {
      const requesterRole = String(req.user?.role || "")
        .trim()
        .toUpperCase();
      if (requesterRole !== "ITADMIN") {
        return res.status(403).json({
          error: "Forbidden",
          details: "Only ITADMIN can access this endpoint",
        });
      }

      const tokenSchoolCode =
        typeof req.user?.schoolCode === "string"
          ? req.user.schoolCode.trim()
          : "";
      if (!tokenSchoolCode) {
        return res.status(400).json({
          error: "Invalid token payload",
          details: "Token does not contain schoolCode",
        });
      }

      const schoolColumnResult = await pool.query(FIND_SCHOOL_CODE_COLUMN);
      const schoolPkResult = await pool.query(FIND_SCHOOL_PK_COLUMN);

      if (schoolColumnResult.rowCount === 0) {
        return res.status(500).json({
          error: "Failed to list users",
          details: "No supported school code column found in table 'school'",
        });
      }

      const schoolCodeColumn = schoolColumnResult.rows[0].column_name;
      const schoolPkColumn =
        schoolPkResult.rowCount > 0 ? schoolPkResult.rows[0].column_name : null;

      const schoolResult = await pool.query(
        findSchoolByCodeQuery(schoolCodeColumn, schoolPkColumn),
        [tokenSchoolCode],
      );

      if (schoolResult.rowCount === 0) {
        return res.status(404).json({
          error: "School not found",
          schoolCode: tokenSchoolCode,
        });
      }

      const userSchoolIdResult = await pool.query(FIND_USERS_SCHOOL_ID_COLUMN);
      const userSchoolCodeResult = await pool.query(
        FIND_USERS_SCHOOL_CODE_COLUMN,
      );

      const userNameResult = await pool.query(FIND_USERS_NAME_COLUMN);
      const userEmailResult = await pool.query(FIND_USERS_EMAIL_COLUMN);
      const userPhoneResult = await pool.query(FIND_USERS_PHONE_COLUMN);
      const userWhatsappResult = await pool.query(FIND_USERS_WHATSAPP_COLUMN);
      const userRoleTextResult = await pool.query(FIND_USERS_ROLE_TEXT_COLUMN);
      const userRoleIdResult = await pool.query(FIND_USERS_ROLE_ID_COLUMN);

      let filterColumn = null;
      let filterValue = null;

      if (userSchoolIdResult.rowCount > 0 && schoolPkColumn) {
        filterColumn = userSchoolIdResult.rows[0].column_name;
        filterValue = schoolResult.rows[0].school_pk;
      } else if (userSchoolCodeResult.rowCount > 0) {
        filterColumn = userSchoolCodeResult.rows[0].column_name;
        filterValue = schoolResult.rows[0].school_code_value;
      }

      if (!filterColumn || !filterValue) {
        return res.status(500).json({
          error: "Failed to list users",
          details:
            "Unable to resolve users school mapping using school_id or school_code",
        });
      }

      const userNameColumn =
        userNameResult.rowCount > 0 ? userNameResult.rows[0].column_name : null;
      const userEmailColumn =
        userEmailResult.rowCount > 0
          ? userEmailResult.rows[0].column_name
          : null;
      const userPhoneColumn =
        userPhoneResult.rowCount > 0
          ? userPhoneResult.rows[0].column_name
          : null;
      const userWhatsappColumn =
        userWhatsappResult.rowCount > 0
          ? userWhatsappResult.rows[0].column_name
          : null;
      const userRoleTextColumn =
        userRoleTextResult.rowCount > 0
          ? userRoleTextResult.rows[0].column_name
          : null;
      const userRoleIdColumn =
        userRoleIdResult.rowCount > 0
          ? userRoleIdResult.rows[0].column_name
          : null;

      if (!userRoleTextColumn && !userRoleIdColumn) {
        return res.status(500).json({
          error: "Failed to list users",
          details: "No supported role column found in table 'users'",
        });
      }

      let roleJoinSql = "";
      let roleSelectSql = "";
      if (userRoleIdColumn) {
        const roleTableResult = await pool.query(FIND_ROLES_TABLE);

        if (roleTableResult.rowCount === 0) {
          return res.status(500).json({
            error: "Failed to list users",
            details: "Roles table not found (expected 'roles' or 'roles1')",
          });
        }

        const roleTableName = roleTableResult.rows[0].table_name;
        const rolePkResult = await pool.query(FIND_ROLE_PK_IN_TABLE, [
          roleTableName,
        ]);
        const roleNameResult = await pool.query(FIND_ROLE_NAME_IN_TABLE, [
          roleTableName,
        ]);

        if (rolePkResult.rowCount === 0 || roleNameResult.rowCount === 0) {
          return res.status(500).json({
            error: "Failed to list users",
            details: "No supported role id/name columns found in roles table",
          });
        }

        const rolePkColumn = rolePkResult.rows[0].column_name;
        const roleNameColumn = roleNameResult.rows[0].column_name;
        roleJoinSql = ` LEFT JOIN "${roleTableName}" r ON r."${rolePkColumn}"::text = u."${userRoleIdColumn}"::text`;
        roleSelectSql = `r."${roleNameColumn}"::text AS role`;
      } else if (userRoleTextColumn) {
        roleSelectSql = `u."${userRoleTextColumn}"::text AS role`;
      }

      const nameSelectSql = userNameColumn
        ? `u."${userNameColumn}"::text AS name`
        : `NULL::text AS name`;
      const emailSelectSql = userEmailColumn
        ? `u."${userEmailColumn}"::text AS email`
        : `NULL::text AS email`;
      const phoneSelectSql = userPhoneColumn
        ? `u."${userPhoneColumn}"::text AS phone`
        : `NULL::text AS phone`;
      const whatsappSelectSql = userWhatsappColumn
        ? `u."${userWhatsappColumn}"::text AS whatsapp`
        : `NULL::text AS whatsapp`;

      const usersQuery = listUsersForSchoolQuery({
        nameSelectSql,
        emailSelectSql,
        phoneSelectSql,
        whatsappSelectSql,
        roleSelectSql,
        roleJoinSql,
        filterColumn,
      });
      const usersResult = await pool.query(usersQuery, [filterValue]);
      const filteredUsers = usersResult.rows.filter((user) => {
        const role = String(user.role || "")
          .trim()
          .toUpperCase();
        return role !== "OWNER" && role !== "ITADMIN";
      });

      return res.json({
        schoolCode: tokenSchoolCode,
        count: filteredUsers.length,
        users: filteredUsers,
      });
    } catch (error) {
      return res.status(500).json(buildDbError(error, "Failed to list users"));
    }
  }

  async function itAdminAddClass(req, res) {
    try {
      const requesterRole = String(req.user?.role || "")
        .trim()
        .toUpperCase();
      if (requesterRole !== "ITADMIN") {
        return res.status(403).json({
          error: "Forbidden",
          details: "Only ITADMIN can access this endpoint",
        });
      }

      const className =
        typeof req.body?.class_name === "string" ||
        typeof req.body?.class_name === "number"
          ? String(req.body.class_name).trim()
          : typeof req.body?.className === "string" ||
              typeof req.body?.className === "number"
            ? String(req.body.className).trim()
            : "";

      if (!className) {
        return res.status(400).json({
          error: "class_name is required",
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

      const classNameResult = await pool.query(FIND_CLASSES_NAME_COLUMN);
      if (classNameResult.rowCount === 0) {
        return res.status(500).json({
          error: "Failed to add class",
          details: "No supported class name column found in table 'classes'",
        });
      }

      const classNameColumn = classNameResult.rows[0].column_name;
      const classCreatedByColumn = await findFirstExistingColumn("classes", [
        "created_by",
        "createdby",
        "created_by_id",
      ]);

      if (!classCreatedByColumn) {
        return res.status(500).json({
          error: "Failed to add class",
          details: "No supported created_by column found in table 'classes'",
        });
      }

      const classSchoolIdColumn = await findFirstExistingColumn("classes", [
        "school_id",
        "schoolid",
      ]);
      const classSchoolCodeColumn = await findFirstExistingColumn("classes", [
        "school_code",
        "schoolcode",
      ]);

      let schoolResolved = null;
      if (classSchoolIdColumn || classSchoolCodeColumn) {
        const tokenSchoolCode =
          typeof req.user?.schoolCode === "string"
            ? req.user.schoolCode.trim()
            : "";
        if (!tokenSchoolCode) {
          return res.status(400).json({
            error: "Invalid token payload",
            details:
              "Token does not contain schoolCode required for class-school mapping",
          });
        }

        schoolResolved = await resolveSchoolForParamCode(tokenSchoolCode);
        if (schoolResolved.error) {
          return res
            .status(schoolResolved.error.status)
            .json(schoolResolved.error.payload);
        }

        if (classSchoolIdColumn && !schoolResolved.schoolPkValue) {
          return res.status(500).json({
            error: "Failed to add class",
            details:
              "classes table expects school_id but school primary key could not be resolved",
          });
        }
      }

      const duplicateWhere = [
        `LOWER("${classNameColumn}"::text) = LOWER($1::text)`,
      ];
      const duplicateValues = [className];

      if (classSchoolIdColumn && schoolResolved) {
        duplicateWhere.push(
          `"${classSchoolIdColumn}"::text = $${duplicateValues.length + 1}::text`,
        );
        duplicateValues.push(schoolResolved.schoolPkValue);
      } else if (classSchoolCodeColumn && schoolResolved) {
        duplicateWhere.push(
          `"${classSchoolCodeColumn}"::text = $${duplicateValues.length + 1}::text`,
        );
        duplicateValues.push(schoolResolved.schoolCodeValue);
      }

      const duplicateResult = await pool.query(
        `
          SELECT 1
          FROM "classes"
          WHERE ${duplicateWhere.join(" AND ")}
          LIMIT 1;
        `,
        duplicateValues,
      );

      if (duplicateResult.rowCount > 0) {
        return res.status(409).json({
          error: "Class already exists",
          class_name: className,
        });
      }

      const insertColumns = [
        `"${classNameColumn}"`,
        `"${classCreatedByColumn}"`,
      ];
      const insertValues = [className, createdBy];

      if (classSchoolIdColumn && schoolResolved) {
        insertColumns.push(`"${classSchoolIdColumn}"`);
        insertValues.push(schoolResolved.schoolPkValue);
      }

      if (classSchoolCodeColumn && schoolResolved) {
        insertColumns.push(`"${classSchoolCodeColumn}"`);
        insertValues.push(schoolResolved.schoolCodeValue);
      }

      const valuePlaceholders = insertValues
        .map((_, index) => `$${index + 1}`)
        .join(", ");
      const insertResult = await pool.query(
        `
          INSERT INTO "classes" (${insertColumns.join(", ")})
          VALUES (${valuePlaceholders})
          RETURNING *;
        `,
        insertValues,
      );

      return res.status(201).json({
        success: true,
        message: "Class added successfully",
        class: insertResult.rows[0],
      });
    } catch (error) {
      return res.status(500).json(buildDbError(error, "Failed to add class"));
    }
  }

  async function itAdminClassesAndTeachers(req, res) {
    try {
      const requesterRole = String(req.user?.role || "")
        .trim()
        .toUpperCase();
      if (requesterRole !== "ITADMIN") {
        return res.status(403).json({
          error: "Forbidden",
          details: "Only ITADMIN can access this endpoint",
        });
      }

      const tokenSchoolCode =
        typeof req.user?.schoolCode === "string"
          ? req.user.schoolCode.trim()
          : "";
      if (!tokenSchoolCode) {
        return res.status(400).json({
          error: "Invalid token payload",
          details: "Token does not contain schoolCode",
        });
      }

      const schoolResolved = await resolveSchoolForParamCode(tokenSchoolCode);
      if (schoolResolved.error) {
        return res
          .status(schoolResolved.error.status)
          .json(schoolResolved.error.payload);
      }

      const classPkResult = await pool.query(FIND_CLASSES_PK_COLUMN);
      const classNameResult = await pool.query(FIND_CLASSES_NAME_COLUMN);

      if (classNameResult.rowCount === 0) {
        return res.status(500).json({
          error: "Failed to list classes",
          details: "No supported class name column found in table 'classes'",
        });
      }

      const classPkColumn =
        classPkResult.rowCount > 0 ? classPkResult.rows[0].column_name : null;
      const classNameColumn = classNameResult.rows[0].column_name;
      const classSchoolIdColumn = await findFirstExistingColumn("classes", [
        "school_id",
        "schoolid",
      ]);
      const classSchoolCodeColumn = await findFirstExistingColumn("classes", [
        "school_code",
        "schoolcode",
      ]);

      let classesWhereSql = "";
      const classesValues = [];
      if (classSchoolIdColumn && schoolResolved.schoolPkValue) {
        classesWhereSql = `WHERE "${classSchoolIdColumn}"::text = $1::text`;
        classesValues.push(schoolResolved.schoolPkValue);
      } else if (classSchoolCodeColumn) {
        classesWhereSql = `WHERE "${classSchoolCodeColumn}"::text = $1::text`;
        classesValues.push(schoolResolved.schoolCodeValue);
      }

      const classesResult = await pool.query(
        `
          SELECT
            ${classPkColumn ? `"${classPkColumn}"::text` : `NULL::text`} AS class_id,
            "${classNameColumn}"::text AS class_name
          FROM "classes"
          ${classesWhereSql}
          ORDER BY class_name NULLS LAST;
        `,
        classesValues,
      );

      const teacherTableResult = await pool.query(
        `
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = 'teachers'
          LIMIT 1;
        `,
      );

      if (teacherTableResult.rowCount === 0) {
        return res.status(500).json({
          error: "Failed to list teachers",
          details: "Table 'teachers' not found",
        });
      }

      const teacherIdColumn = await findFirstExistingColumn("teachers", [
        "teacher_id",
        "id",
      ]);
      const teacherNameColumn = await findFirstExistingColumn("teachers", [
        "name",
        "teacher_name",
        "full_name",
      ]);
      const teacherSchoolIdColumn = await findFirstExistingColumn("teachers", [
        "school_id",
        "schoolid",
      ]);
      const teacherSchoolCodeColumn = await findFirstExistingColumn(
        "teachers",
        ["school_code", "schoolcode", "code"],
      );
      const teacherUserIdColumn = await findFirstExistingColumn("teachers", [
        "user_id",
        "userid",
      ]);

      const usersTableResult = await pool.query(FIND_USERS_TABLE);
      const usersExists = usersTableResult.rowCount > 0;
      const userPkColumn = usersExists
        ? await findFirstExistingColumn("users", ["user_id", "id"])
        : null;
      const userNameColumn = usersExists
        ? await findFirstExistingColumn("users", [
            "name",
            "full_name",
            "user_name",
            "username",
          ])
        : null;
      const userEmailColumn = usersExists
        ? await findFirstExistingColumn("users", ["email", "email_id", "mail"])
        : null;
      const userPhoneColumn = usersExists
        ? await findFirstExistingColumn("users", [
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

      let teachersWhereSql = "";
      const teachersValues = [];
      if (teacherSchoolIdColumn && schoolResolved.schoolPkValue) {
        teachersWhereSql = `WHERE t."${teacherSchoolIdColumn}"::text = $1::text`;
        teachersValues.push(schoolResolved.schoolPkValue);
      } else if (teacherSchoolCodeColumn) {
        teachersWhereSql = `WHERE t."${teacherSchoolCodeColumn}"::text = $1::text`;
        teachersValues.push(schoolResolved.schoolCodeValue);
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
          ${teachersWhereSql}
          ORDER BY name NULLS LAST;
        `,
        teachersValues,
      );

      return res.json({
        schoolCode: schoolResolved.schoolCodeValue,
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

  async function itAdminUpdateSection(req, res) {
    try {
      const requesterRole = String(req.user?.role || "")
        .trim()
        .toUpperCase();
      if (requesterRole !== "ITADMIN") {
        return res.status(403).json({
          error: "Forbidden",
          details: "Only ITADMIN can access this endpoint",
        });
      }

      const sectionId =
        typeof req.params?.sectionId === "string" ||
        typeof req.params?.sectionId === "number"
          ? String(req.params.sectionId).trim()
          : typeof req.body?.sectionId === "string" ||
              typeof req.body?.sectionId === "number"
            ? String(req.body.sectionId).trim()
            : "";
      const teacherId =
        typeof req.body?.teacher_id === "string" ||
        typeof req.body?.teacher_id === "number"
          ? String(req.body.teacher_id).trim()
          : typeof req.body?.teacherId === "string" ||
              typeof req.body?.teacherId === "number"
            ? String(req.body.teacherId).trim()
            : "";
      const classId =
        typeof req.body?.class_id === "string" ||
        typeof req.body?.class_id === "number"
          ? String(req.body.class_id).trim()
          : typeof req.body?.classId === "string" ||
              typeof req.body?.classId === "number"
            ? String(req.body.classId).trim()
            : "";
      const sectionName =
        typeof req.body?.section_name === "string" ||
        typeof req.body?.section_name === "number"
          ? String(req.body.section_name).trim()
          : typeof req.body?.sectionName === "string" ||
              typeof req.body?.sectionName === "number"
            ? String(req.body.sectionName).trim()
            : "";

      if (!sectionId || !teacherId || !classId || !sectionName) {
        return res.status(400).json({
          error: "sectionId, teacherId, classId, and sectionName are required",
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

      const tokenSchoolCode =
        typeof req.user?.schoolCode === "string"
          ? req.user.schoolCode.trim()
          : "";
      if (!tokenSchoolCode) {
        return res.status(400).json({
          error: "Invalid token payload",
          details: "Token does not contain schoolCode",
        });
      }

      const schoolResolved = await resolveSchoolForParamCode(tokenSchoolCode);
      if (schoolResolved.error) {
        return res
          .status(schoolResolved.error.status)
          .json(schoolResolved.error.payload);
      }

      const sectionsTableResult = await pool.query(FIND_SECTIONS_TABLE);
      if (sectionsTableResult.rowCount === 0) {
        return res.status(500).json({
          error: "Failed to update section",
          details: "Table 'sections' not found",
        });
      }

      const sectionPkResult = await pool.query(FIND_SECTIONS_PK_COLUMN);
      const sectionNameResult = await pool.query(FIND_SECTIONS_NAME_COLUMN);
      const sectionClassIdResult = await pool.query(
        FIND_SECTIONS_CLASS_ID_COLUMN,
      );

      if (
        sectionPkResult.rowCount === 0 ||
        sectionNameResult.rowCount === 0 ||
        sectionClassIdResult.rowCount === 0
      ) {
        return res.status(500).json({
          error: "Failed to update section",
          details:
            "No supported section id/name/class_id columns found in table 'sections'",
        });
      }

      const sectionPkColumn = sectionPkResult.rows[0].column_name;
      const sectionNameColumn = sectionNameResult.rows[0].column_name;
      const sectionClassIdColumn = sectionClassIdResult.rows[0].column_name;
      const sectionTeacherIdColumn = await findFirstExistingColumn("sections", [
        "class_teacher_id",
        "class_teacherid",
        "teacher_id",
        "teacherid",
      ]);
      const sectionCreatedByColumn = await findFirstExistingColumn("sections", [
        "created_by",
        "createdby",
        "created_by_id",
      ]);

      if (!sectionTeacherIdColumn || !sectionCreatedByColumn) {
        return res.status(500).json({
          error: "Failed to update section",
          details:
            "No supported teacher_id/created_by columns found in table 'sections'",
        });
      }

      const sectionSchoolIdColumn = await findFirstExistingColumn("sections", [
        "school_id",
        "schoolid",
      ]);
      const sectionSchoolCodeColumn = await findFirstExistingColumn(
        "sections",
        ["school_code", "schoolcode"],
      );

      const sectionWhereParts = [`"${sectionPkColumn}"::text = $1::text`];
      const sectionWhereValues = [sectionId];
      if (sectionSchoolIdColumn && schoolResolved.schoolPkValue) {
        sectionWhereParts.push(
          `"${sectionSchoolIdColumn}"::text = $${sectionWhereValues.length + 1}::text`,
        );
        sectionWhereValues.push(schoolResolved.schoolPkValue);
      } else if (sectionSchoolCodeColumn) {
        sectionWhereParts.push(
          `"${sectionSchoolCodeColumn}"::text = $${sectionWhereValues.length + 1}::text`,
        );
        sectionWhereValues.push(schoolResolved.schoolCodeValue);
      }

      const sectionExistsResult = await pool.query(
        `
          SELECT 1
          FROM "sections"
          WHERE ${sectionWhereParts.join(" AND ")}
          LIMIT 1;
        `,
        sectionWhereValues,
      );

      if (sectionExistsResult.rowCount === 0) {
        return res.status(404).json({
          error: "Section not found",
          sectionId,
        });
      }

      const classPkResult = await pool.query(FIND_CLASSES_PK_COLUMN);
      if (classPkResult.rowCount === 0) {
        return res.status(500).json({
          error: "Failed to update section",
          details: "No supported class id column found in table 'classes'",
        });
      }

      const classPkColumn = classPkResult.rows[0].column_name;
      const classSchoolIdColumn = await findFirstExistingColumn("classes", [
        "school_id",
        "schoolid",
      ]);
      const classSchoolCodeColumn = await findFirstExistingColumn("classes", [
        "school_code",
        "schoolcode",
      ]);

      const classWhereParts = [`"${classPkColumn}"::text = $1::text`];
      const classWhereValues = [classId];
      if (classSchoolIdColumn && schoolResolved.schoolPkValue) {
        classWhereParts.push(
          `"${classSchoolIdColumn}"::text = $${classWhereValues.length + 1}::text`,
        );
        classWhereValues.push(schoolResolved.schoolPkValue);
      } else if (classSchoolCodeColumn) {
        classWhereParts.push(
          `"${classSchoolCodeColumn}"::text = $${classWhereValues.length + 1}::text`,
        );
        classWhereValues.push(schoolResolved.schoolCodeValue);
      }

      const classExistsResult = await pool.query(
        `
          SELECT 1
          FROM "classes"
          WHERE ${classWhereParts.join(" AND ")}
          LIMIT 1;
        `,
        classWhereValues,
      );

      if (classExistsResult.rowCount === 0) {
        return res.status(400).json({
          error: "Invalid classId",
          classId,
        });
      }

      const teacherTableResult = await pool.query(
        `
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = 'teachers'
          LIMIT 1;
        `,
      );
      if (teacherTableResult.rowCount === 0) {
        return res.status(500).json({
          error: "Failed to update section",
          details: "Table 'teachers' not found",
        });
      }

      const teacherPkColumn = await findFirstExistingColumn("teachers", [
        "teacher_id",
        "id",
      ]);
      if (!teacherPkColumn) {
        return res.status(500).json({
          error: "Failed to update section",
          details: "No supported teacher id column found in table 'teachers'",
        });
      }

      const teacherSchoolIdColumn = await findFirstExistingColumn("teachers", [
        "school_id",
        "schoolid",
      ]);
      const teacherSchoolCodeColumn = await findFirstExistingColumn(
        "teachers",
        ["school_code", "schoolcode", "code"],
      );

      const teacherWhereParts = [`"${teacherPkColumn}"::text = $1::text`];
      const teacherWhereValues = [teacherId];
      if (teacherSchoolIdColumn && schoolResolved.schoolPkValue) {
        teacherWhereParts.push(
          `"${teacherSchoolIdColumn}"::text = $${teacherWhereValues.length + 1}::text`,
        );
        teacherWhereValues.push(schoolResolved.schoolPkValue);
      } else if (teacherSchoolCodeColumn) {
        teacherWhereParts.push(
          `"${teacherSchoolCodeColumn}"::text = $${teacherWhereValues.length + 1}::text`,
        );
        teacherWhereValues.push(schoolResolved.schoolCodeValue);
      }

      const teacherExistsResult = await pool.query(
        `
          SELECT 1
          FROM "teachers"
          WHERE ${teacherWhereParts.join(" AND ")}
          LIMIT 1;
        `,
        teacherWhereValues,
      );

      if (teacherExistsResult.rowCount === 0) {
        return res.status(400).json({
          error: "Invalid teacherId",
          teacherId,
        });
      }

      const updateValues = [
        sectionName,
        classId,
        teacherId,
        createdBy,
        sectionId,
      ];
      const updateWhereParts = [`"${sectionPkColumn}"::text = $5::text`];
      if (sectionSchoolIdColumn && schoolResolved.schoolPkValue) {
        updateWhereParts.push(
          `"${sectionSchoolIdColumn}"::text = $${updateValues.length + 1}::text`,
        );
        updateValues.push(schoolResolved.schoolPkValue);
      } else if (sectionSchoolCodeColumn) {
        updateWhereParts.push(
          `"${sectionSchoolCodeColumn}"::text = $${updateValues.length + 1}::text`,
        );
        updateValues.push(schoolResolved.schoolCodeValue);
      }

      const updateResult = await pool.query(
        `
          UPDATE "sections"
          SET
            "${sectionNameColumn}" = $1,
            "${sectionClassIdColumn}" = $2,
            "${sectionTeacherIdColumn}" = $3,
            "${sectionCreatedByColumn}" = $4
          WHERE ${updateWhereParts.join(" AND ")}
          RETURNING *;
        `,
        updateValues,
      );

      return res.json({
        success: true,
        message: "Section updated successfully",
        section: updateResult.rows[0],
      });
    } catch (error) {
      return res
        .status(500)
        .json(buildDbError(error, "Failed to update section"));
    }
  }

  async function itAdminCreateSection(req, res) {
    try {
      const requesterRole = String(req.user?.role || "")
        .trim()
        .toUpperCase();
      if (requesterRole !== "ITADMIN") {
        return res.status(403).json({
          error: "Forbidden",
          details: "Only ITADMIN can access this endpoint",
        });
      }

      const teacherId =
        typeof req.body?.teacherId === "string" ||
        typeof req.body?.teacherId === "number"
          ? String(req.body.teacherId).trim()
          : typeof req.body?.teacher_id === "string" ||
              typeof req.body?.teacher_id === "number"
            ? String(req.body.teacher_id).trim()
            : "";
      const classId =
        typeof req.body?.classId === "string" ||
        typeof req.body?.classId === "number"
          ? String(req.body.classId).trim()
          : typeof req.body?.class_id === "string" ||
              typeof req.body?.class_id === "number"
            ? String(req.body.class_id).trim()
            : "";
      const sectionName =
        typeof req.body?.sectionName === "string" ||
        typeof req.body?.sectionName === "number"
          ? String(req.body.sectionName).trim()
          : typeof req.body?.section_name === "string" ||
              typeof req.body?.section_name === "number"
            ? String(req.body.section_name).trim()
            : "";

      if (!teacherId || !classId || !sectionName) {
        return res.status(400).json({
          error: "teacher_id, class_id, and section_name are required",
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

      const tokenSchoolCode =
        typeof req.user?.schoolCode === "string"
          ? req.user.schoolCode.trim()
          : "";
      if (!tokenSchoolCode) {
        return res.status(400).json({
          error: "Invalid token payload",
          details: "Token does not contain schoolCode",
        });
      }

      const schoolResolved = await resolveSchoolForParamCode(tokenSchoolCode);
      if (schoolResolved.error) {
        return res
          .status(schoolResolved.error.status)
          .json(schoolResolved.error.payload);
      }

      const sectionsTableResult = await pool.query(FIND_SECTIONS_TABLE);
      if (sectionsTableResult.rowCount === 0) {
        return res.status(500).json({
          error: "Failed to create section",
          details: "Table 'sections' not found",
        });
      }

      const sectionNameResult = await pool.query(FIND_SECTIONS_NAME_COLUMN);
      const sectionClassIdResult = await pool.query(
        FIND_SECTIONS_CLASS_ID_COLUMN,
      );

      if (
        sectionNameResult.rowCount === 0 ||
        sectionClassIdResult.rowCount === 0
      ) {
        return res.status(500).json({
          error: "Failed to create section",
          details:
            "No supported section name/class_id columns found in table 'sections'",
        });
      }

      const sectionNameColumn = sectionNameResult.rows[0].column_name;
      const sectionClassIdColumn = sectionClassIdResult.rows[0].column_name;
      const sectionTeacherIdColumn = await findFirstExistingColumn("sections", [
        "class_teacher_id",
        "class_teacherid",
        "teacher_id",
        "teacherid",
      ]);
      const sectionCreatedByColumn = await findFirstExistingColumn("sections", [
        "created_by",
        "createdby",
        "created_by_id",
      ]);

      if (!sectionTeacherIdColumn || !sectionCreatedByColumn) {
        return res.status(500).json({
          error: "Failed to create section",
          details:
            "No supported teacher_id/created_by columns found in table 'sections'",
        });
      }

      const sectionSchoolIdColumn = await findFirstExistingColumn("sections", [
        "school_id",
        "schoolid",
      ]);
      const sectionSchoolCodeColumn = await findFirstExistingColumn(
        "sections",
        ["school_code", "schoolcode"],
      );

      const classPkResult = await pool.query(FIND_CLASSES_PK_COLUMN);
      if (classPkResult.rowCount === 0) {
        return res.status(500).json({
          error: "Failed to create section",
          details: "No supported class id column found in table 'classes'",
        });
      }

      const classPkColumn = classPkResult.rows[0].column_name;
      const classSchoolIdColumn = await findFirstExistingColumn("classes", [
        "school_id",
        "schoolid",
      ]);
      const classSchoolCodeColumn = await findFirstExistingColumn("classes", [
        "school_code",
        "schoolcode",
      ]);

      const classWhereParts = [`"${classPkColumn}"::text = $1::text`];
      const classWhereValues = [classId];
      if (classSchoolIdColumn && schoolResolved.schoolPkValue) {
        classWhereParts.push(
          `"${classSchoolIdColumn}"::text = $${classWhereValues.length + 1}::text`,
        );
        classWhereValues.push(schoolResolved.schoolPkValue);
      } else if (classSchoolCodeColumn) {
        classWhereParts.push(
          `"${classSchoolCodeColumn}"::text = $${classWhereValues.length + 1}::text`,
        );
        classWhereValues.push(schoolResolved.schoolCodeValue);
      }

      const classExistsResult = await pool.query(
        `
          SELECT 1
          FROM "classes"
          WHERE ${classWhereParts.join(" AND ")}
          LIMIT 1;
        `,
        classWhereValues,
      );

      if (classExistsResult.rowCount === 0) {
        return res.status(400).json({
          error: "Invalid classId",
          classId,
        });
      }

      const teacherTableResult = await pool.query(
        `
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = 'teachers'
          LIMIT 1;
        `,
      );
      if (teacherTableResult.rowCount === 0) {
        return res.status(500).json({
          error: "Failed to create section",
          details: "Table 'teachers' not found",
        });
      }

      const teacherPkColumn = await findFirstExistingColumn("teachers", [
        "teacher_id",
        "id",
      ]);
      if (!teacherPkColumn) {
        return res.status(500).json({
          error: "Failed to create section",
          details: "No supported teacher id column found in table 'teachers'",
        });
      }

      const teacherSchoolIdColumn = await findFirstExistingColumn("teachers", [
        "school_id",
        "schoolid",
      ]);
      const teacherSchoolCodeColumn = await findFirstExistingColumn(
        "teachers",
        ["school_code", "schoolcode", "code"],
      );

      const teacherWhereParts = [`"${teacherPkColumn}"::text = $1::text`];
      const teacherWhereValues = [teacherId];
      if (teacherSchoolIdColumn && schoolResolved.schoolPkValue) {
        teacherWhereParts.push(
          `"${teacherSchoolIdColumn}"::text = $${teacherWhereValues.length + 1}::text`,
        );
        teacherWhereValues.push(schoolResolved.schoolPkValue);
      } else if (teacherSchoolCodeColumn) {
        teacherWhereParts.push(
          `"${teacherSchoolCodeColumn}"::text = $${teacherWhereValues.length + 1}::text`,
        );
        teacherWhereValues.push(schoolResolved.schoolCodeValue);
      }

      const teacherExistsResult = await pool.query(
        `
          SELECT 1
          FROM "teachers"
          WHERE ${teacherWhereParts.join(" AND ")}
          LIMIT 1;
        `,
        teacherWhereValues,
      );

      if (teacherExistsResult.rowCount === 0) {
        return res.status(400).json({
          error: "Invalid teacherId",
          teacherId,
        });
      }

      const duplicateWhereParts = [
        `LOWER("${sectionNameColumn}"::text) = LOWER($1::text)`,
        `"${sectionClassIdColumn}"::text = $2::text`,
      ];
      const duplicateValues = [sectionName, classId];

      if (sectionSchoolIdColumn && schoolResolved.schoolPkValue) {
        duplicateWhereParts.push(
          `"${sectionSchoolIdColumn}"::text = $${duplicateValues.length + 1}::text`,
        );
        duplicateValues.push(schoolResolved.schoolPkValue);
      } else if (sectionSchoolCodeColumn) {
        duplicateWhereParts.push(
          `"${sectionSchoolCodeColumn}"::text = $${duplicateValues.length + 1}::text`,
        );
        duplicateValues.push(schoolResolved.schoolCodeValue);
      }

      const duplicateSectionResult = await pool.query(
        `
          SELECT 1
          FROM "sections"
          WHERE ${duplicateWhereParts.join(" AND ")}
          LIMIT 1;
        `,
        duplicateValues,
      );

      if (duplicateSectionResult.rowCount > 0) {
        return res.status(409).json({
          error: "Section already exists",
          sectionName,
          classId,
        });
      }

      const insertColumns = [
        `"${sectionNameColumn}"`,
        `"${sectionClassIdColumn}"`,
        `"${sectionTeacherIdColumn}"`,
        `"${sectionCreatedByColumn}"`,
      ];
      const insertValues = [sectionName, classId, teacherId, createdBy];

      if (sectionSchoolIdColumn && schoolResolved.schoolPkValue) {
        insertColumns.push(`"${sectionSchoolIdColumn}"`);
        insertValues.push(schoolResolved.schoolPkValue);
      }

      if (sectionSchoolCodeColumn) {
        insertColumns.push(`"${sectionSchoolCodeColumn}"`);
        insertValues.push(schoolResolved.schoolCodeValue);
      }

      const insertResult = await pool.query(
        `
          INSERT INTO "sections" (${insertColumns.join(", ")})
          VALUES (${insertValues.map((_, index) => `$${index + 1}`).join(", ")})
          RETURNING *;
        `,
        insertValues,
      );

      return res.status(201).json({
        success: true,
        message: "Section created successfully",
        section: insertResult.rows[0],
      });
    } catch (error) {
      return res
        .status(500)
        .json(buildDbError(error, "Failed to create section"));
    }
  }

  return {
    health,
    dbHealth,
    tables,
    validateSchoolCode,
    roles,
    superAdminSchools,
    superAdminAddSchool,
    superAdminAddOwner,
    superAdminStudentsClasswise,
    superAdminTeachers,
    superAdminParents,
    superAdminOwnerAndItAdmin,
    itAdminUsers,
    itAdminAddClass,
    itAdminClassesAndTeachers,
    itAdminUpdateSection,
    itAdminCreateSection,
  };
}

module.exports = {
  createSystemController,
};
