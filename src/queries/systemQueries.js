const LIST_PUBLIC_TABLES = `
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
  ORDER BY table_name;
`;

const FIND_SCHOOL_CODE_COLUMN = `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'school'
    AND column_name IN ('school_code', 'schoolcode', 'code')
  ORDER BY CASE
    WHEN column_name = 'school_code' THEN 1
    WHEN column_name = 'schoolcode' THEN 2
    WHEN column_name = 'code' THEN 3
    ELSE 99
  END
  LIMIT 1;
`;

const FIND_SCHOOL_PK_COLUMN = `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'school'
    AND column_name IN ('school_id', 'id')
  ORDER BY CASE
    WHEN column_name = 'school_id' THEN 1
    WHEN column_name = 'id' THEN 2
    ELSE 99
  END
  LIMIT 1;
`;

function findSchoolByCodeQuery(schoolCodeColumn, includePk) {
  const schoolSelectPkSql = includePk
    ? `, "${includePk}"::text AS school_pk`
    : "";
  return `
    SELECT "${schoolCodeColumn}"::text AS school_code_value${schoolSelectPkSql}
    FROM "school"
    WHERE LOWER("${schoolCodeColumn}"::text) = LOWER($1)
    LIMIT 1;
  `;
}

const FIND_ROLES_TABLE = `
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
`;

function listRolesQuery(tableName) {
  return `SELECT * FROM "${tableName}" ORDER BY 1;`;
}

const FIND_USERS_SCHOOL_ID_COLUMN = `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND column_name IN ('school_id', 'schoolid')
  ORDER BY CASE
    WHEN column_name = 'school_id' THEN 1
    WHEN column_name = 'schoolid' THEN 2
    ELSE 99
  END
  LIMIT 1;
`;

const FIND_USERS_SCHOOL_CODE_COLUMN = `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND column_name IN ('school_code', 'schoolcode', 'code')
  ORDER BY CASE
    WHEN column_name = 'school_code' THEN 1
    WHEN column_name = 'schoolcode' THEN 2
    WHEN column_name = 'code' THEN 3
    ELSE 99
  END
  LIMIT 1;
`;

const FIND_USERS_NAME_COLUMN = `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND column_name IN ('name', 'full_name', 'user_name', 'username')
  ORDER BY CASE
    WHEN column_name = 'name' THEN 1
    WHEN column_name = 'full_name' THEN 2
    WHEN column_name = 'user_name' THEN 3
    WHEN column_name = 'username' THEN 4
    ELSE 99
  END
  LIMIT 1;
`;

const FIND_USERS_EMAIL_COLUMN = `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND column_name IN ('email', 'email_id', 'mail')
  ORDER BY CASE
    WHEN column_name = 'email' THEN 1
    WHEN column_name = 'email_id' THEN 2
    WHEN column_name = 'mail' THEN 3
    ELSE 99
  END
  LIMIT 1;
`;

const FIND_USERS_PHONE_COLUMN = `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND column_name IN ('phone', 'mobile', 'phone_number', 'contact_no')
  ORDER BY CASE
    WHEN column_name = 'phone' THEN 1
    WHEN column_name = 'mobile' THEN 2
    WHEN column_name = 'phone_number' THEN 3
    WHEN column_name = 'contact_no' THEN 4
    ELSE 99
  END
  LIMIT 1;
`;

const FIND_USERS_WHATSAPP_COLUMN = `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND column_name IN ('whatsapp', 'whatsapp_no', 'whatsapp_number')
  ORDER BY CASE
    WHEN column_name = 'whatsapp' THEN 1
    WHEN column_name = 'whatsapp_no' THEN 2
    WHEN column_name = 'whatsapp_number' THEN 3
    ELSE 99
  END
  LIMIT 1;
`;

const FIND_USERS_ROLE_TEXT_COLUMN = `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND column_name IN ('role', 'user_role', 'role_name')
  ORDER BY CASE
    WHEN column_name = 'role' THEN 1
    WHEN column_name = 'user_role' THEN 2
    WHEN column_name = 'role_name' THEN 3
    ELSE 99
  END
  LIMIT 1;
`;

const FIND_USERS_ROLE_ID_COLUMN = `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND column_name IN ('role_id', 'roleid')
  ORDER BY CASE
    WHEN column_name = 'role_id' THEN 1
    WHEN column_name = 'roleid' THEN 2
    ELSE 99
  END
  LIMIT 1;
`;

const FIND_ROLE_PK_IN_TABLE = `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = $1
    AND column_name IN ('role_id', 'id')
  ORDER BY CASE
    WHEN column_name = 'role_id' THEN 1
    WHEN column_name = 'id' THEN 2
    ELSE 99
  END
  LIMIT 1;
`;

const FIND_ROLE_NAME_IN_TABLE = `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = $1
    AND column_name IN ('role', 'role_name', 'name', 'title', 'type')
  ORDER BY CASE
    WHEN column_name = 'role' THEN 1
    WHEN column_name = 'role_name' THEN 2
    WHEN column_name = 'name' THEN 3
    WHEN column_name = 'title' THEN 4
    WHEN column_name = 'type' THEN 5
    ELSE 99
  END
  LIMIT 1;
`;

function listUsersForSchoolQuery({
  nameSelectSql,
  emailSelectSql,
  phoneSelectSql,
  whatsappSelectSql,
  roleSelectSql,
  roleJoinSql,
  filterColumn,
}) {
  return `
    SELECT
      ${nameSelectSql},
      ${emailSelectSql},
      ${phoneSelectSql},
      ${whatsappSelectSql},
      ${roleSelectSql}
    FROM "users" u
    ${roleJoinSql}
    WHERE u."${filterColumn}"::text = $1::text
    ORDER BY name NULLS LAST, email NULLS LAST;
  `;
}

module.exports = {
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
};
