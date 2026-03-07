const {
  LIST_PUBLIC_TABLES,
  FIND_SCHOOL_CODE_COLUMN,
  FIND_SCHOOL_PK_COLUMN,
  FIND_ROLES_TABLE,
  FIND_USERS_SCHOOL_ID_COLUMN,
  FIND_USERS_SCHOOL_CODE_COLUMN,
  FIND_USERS_NAME_COLUMN,
  FIND_USERS_EMAIL_COLUMN,
  FIND_USERS_PHONE_COLUMN,
  FIND_USERS_WHATSAPP_COLUMN,
  FIND_USERS_ROLE_TEXT_COLUMN,
  FIND_USERS_ROLE_ID_COLUMN,
  FIND_ROLE_PK_IN_TABLE,
  FIND_ROLE_NAME_IN_TABLE,
  findSchoolByCodeQuery,
  listRolesQuery,
  listUsersForSchoolQuery,
} = require("../queries/systemQueries");

function createSystemController({ pool, buildDbError }) {
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

  return {
    health,
    dbHealth,
    tables,
    validateSchoolCode,
    roles,
    itAdminUsers,
  };
}

module.exports = {
  createSystemController,
};
