const {
  LIST_PUBLIC_TABLES,
  FIND_SCHOOL_CODE_COLUMN,
  FIND_SCHOOL_PK_COLUMN,
  FIND_SCHOOL_NAME_COLUMN,
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
  FIND_STUDENTS_SCHOOL_CODE_COLUMN,
  FIND_STUDENTS_CLASS_COLUMN,
  FIND_STUDENTS_PK_COLUMN,
  FIND_STUDENT_ENROLLMENTS_TABLE,
  FIND_ENROLLMENTS_SCHOOL_ID_COLUMN,
  FIND_ENROLLMENTS_SCHOOL_CODE_COLUMN,
  FIND_ENROLLMENTS_STUDENT_ID_COLUMN,
  FIND_ENROLLMENTS_CLASS_ID_COLUMN,
  FIND_ENROLLMENTS_CLASS_TEXT_COLUMN,
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
  listClassIdToNameQuery,
  listEnrollmentClassMappingsQuery,
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
      const schoolResolved = await resolveSchoolForParamCode(schoolCode);
      if (schoolResolved.error) {
        return res
          .status(schoolResolved.error.status)
          .json(schoolResolved.error.payload);
      }

      const studentSchoolIdResult = await pool.query(
        FIND_STUDENTS_SCHOOL_ID_COLUMN,
      );
      const studentSchoolCodeResult = await pool.query(
        FIND_STUDENTS_SCHOOL_CODE_COLUMN,
      );
      const studentClassResult = await pool.query(FIND_STUDENTS_CLASS_COLUMN);
      const studentPkResult = await pool.query(FIND_STUDENTS_PK_COLUMN);

      let filterColumn = null;
      let filterValue = null;

      if (studentSchoolIdResult.rowCount > 0 && schoolResolved.schoolPkColumn) {
        filterColumn = studentSchoolIdResult.rows[0].column_name;
        filterValue = schoolResolved.schoolPkValue;
      } else if (studentSchoolCodeResult.rowCount > 0) {
        filterColumn = studentSchoolCodeResult.rows[0].column_name;
        filterValue = schoolResolved.schoolCodeValue;
      }

      if (!filterColumn || filterValue === null || filterValue === undefined) {
        return res.status(500).json({
          error: "Failed to list students",
          details:
            "Unable to resolve students school mapping using school_id or school_code",
        });
      }

      const studentsQuery = listStudentsForSchoolQuery(filterColumn);
      const studentsResult = await pool.query(studentsQuery, [filterValue]);

      let classColumn =
        studentClassResult.rowCount > 0
          ? studentClassResult.rows[0].column_name
          : null;
      let classByStudentIdMap = null;

      if (!classColumn) {
        const enrollmentsTableResult = await pool.query(
          FIND_STUDENT_ENROLLMENTS_TABLE,
        );
        if (enrollmentsTableResult.rowCount > 0) {
          const enrollmentSchoolIdResult = await pool.query(
            FIND_ENROLLMENTS_SCHOOL_ID_COLUMN,
          );
          const enrollmentSchoolCodeResult = await pool.query(
            FIND_ENROLLMENTS_SCHOOL_CODE_COLUMN,
          );
          const enrollmentStudentIdResult = await pool.query(
            FIND_ENROLLMENTS_STUDENT_ID_COLUMN,
          );
          const enrollmentClassIdResult = await pool.query(
            FIND_ENROLLMENTS_CLASS_ID_COLUMN,
          );
          const enrollmentClassTextResult = await pool.query(
            FIND_ENROLLMENTS_CLASS_TEXT_COLUMN,
          );

          let enrollmentFilterColumn = null;
          let enrollmentFilterValue = null;

          if (
            enrollmentSchoolIdResult.rowCount > 0 &&
            schoolResolved.schoolPkColumn
          ) {
            enrollmentFilterColumn =
              enrollmentSchoolIdResult.rows[0].column_name;
            enrollmentFilterValue = schoolResolved.schoolPkValue;
          } else if (enrollmentSchoolCodeResult.rowCount > 0) {
            enrollmentFilterColumn =
              enrollmentSchoolCodeResult.rows[0].column_name;
            enrollmentFilterValue = schoolResolved.schoolCodeValue;
          }

          const enrollmentStudentIdColumn =
            enrollmentStudentIdResult.rowCount > 0
              ? enrollmentStudentIdResult.rows[0].column_name
              : null;
          const enrollmentClassValueColumn =
            enrollmentClassTextResult.rowCount > 0
              ? enrollmentClassTextResult.rows[0].column_name
              : enrollmentClassIdResult.rowCount > 0
                ? enrollmentClassIdResult.rows[0].column_name
                : null;

          if (
            enrollmentFilterColumn &&
            enrollmentFilterValue !== null &&
            enrollmentFilterValue !== undefined &&
            enrollmentStudentIdColumn &&
            enrollmentClassValueColumn
          ) {
            const enrollmentMappingsResult = await pool.query(
              listEnrollmentClassMappingsQuery({
                schoolFilterColumn: enrollmentFilterColumn,
                studentIdColumn: enrollmentStudentIdColumn,
                classValueColumn: enrollmentClassValueColumn,
              }),
              [enrollmentFilterValue],
            );

            classByStudentIdMap = enrollmentMappingsResult.rows.reduce(
              (acc, row) => {
                const studentIdValue = String(
                  row.student_id_value || "",
                ).trim();
                const classValue = String(row.class_value || "").trim();
                if (studentIdValue && classValue && !acc[studentIdValue]) {
                  acc[studentIdValue] = classValue;
                }
                return acc;
              },
              {},
            );

            classColumn = enrollmentClassValueColumn;
          }
        }
      }

      if (!classColumn) {
        return res.status(500).json({
          error: "Failed to list students class wise",
          details:
            "No supported class mapping found in 'students' or 'student_enrollments'",
        });
      }

      let classIdToNameMap = null;
      if (classColumn === "class_id" || classColumn === "classid") {
        const classPkResult = await pool.query(FIND_CLASSES_PK_COLUMN);
        const classNameResult = await pool.query(FIND_CLASSES_NAME_COLUMN);
        if (classPkResult.rowCount > 0 && classNameResult.rowCount > 0) {
          const classMapResult = await pool.query(
            listClassIdToNameQuery(
              classPkResult.rows[0].column_name,
              classNameResult.rows[0].column_name,
            ),
          );
          classIdToNameMap = classMapResult.rows.reduce((acc, row) => {
            acc[String(row.class_id_value)] = row.class_name_value;
            return acc;
          }, {});
        }
      }

      const grouped = new Map();

      const studentPkColumn =
        studentPkResult.rowCount > 0
          ? studentPkResult.rows[0].column_name
          : null;

      studentsResult.rows.forEach((student) => {
        const rawClassValue = classByStudentIdMap
          ? studentPkColumn
            ? classByStudentIdMap[String(student[studentPkColumn] || "").trim()]
            : null
          : student[classColumn];
        let className =
          rawClassValue === null || rawClassValue === undefined
            ? "UNASSIGNED"
            : String(rawClassValue).trim() || "UNASSIGNED";

        if (classIdToNameMap && classIdToNameMap[className]) {
          className = classIdToNameMap[className];
        }

        if (!grouped.has(className)) {
          grouped.set(className, []);
        }
        grouped.get(className).push(student);
      });

      const classes = Array.from(grouped.entries())
        .map(([className, students]) => ({
          className,
          count: students.length,
          students,
        }))
        .sort((a, b) => a.className.localeCompare(b.className));

      return res.json({
        schoolCode: schoolResolved.schoolCodeValue,
        classColumn,
        totalStudents: studentsResult.rowCount,
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

  return {
    health,
    dbHealth,
    tables,
    validateSchoolCode,
    roles,
    superAdminSchools,
    superAdminStudentsClasswise,
    superAdminTeachers,
    superAdminParents,
    superAdminOwnerAndItAdmin,
    itAdminUsers,
  };
}

module.exports = {
  createSystemController,
};
