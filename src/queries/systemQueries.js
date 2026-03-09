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

const FIND_SCHOOL_NAME_COLUMN = `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'school'
    AND column_name IN ('school_name', 'name', 'schoolname')
  ORDER BY CASE
    WHEN column_name = 'school_name' THEN 1
    WHEN column_name = 'name' THEN 2
    WHEN column_name = 'schoolname' THEN 3
    ELSE 99
  END
  LIMIT 1;
`;

const FIND_SCHOOL_OWNER_COLUMN = `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'school'
    AND column_name IN ('owner', 'owner_name', 'owner_id', 'ownerid')
  ORDER BY CASE
    WHEN column_name = 'owner' THEN 1
    WHEN column_name = 'owner_name' THEN 2
    WHEN column_name = 'owner_id' THEN 3
    WHEN column_name = 'ownerid' THEN 4
    ELSE 99
  END
  LIMIT 1;
`;

const FIND_SCHOOL_STATUS_COLUMN = `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'school'
    AND column_name IN ('status', 'school_status', 'is_active', 'active')
  ORDER BY CASE
    WHEN column_name = 'status' THEN 1
    WHEN column_name = 'school_status' THEN 2
    WHEN column_name = 'is_active' THEN 3
    WHEN column_name = 'active' THEN 4
    ELSE 99
  END
  LIMIT 1;
`;

const FIND_SCHOOL_CREATED_BY_COLUMN = `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'school'
    AND column_name IN ('created_by', 'createdby', 'created_by_id')
  ORDER BY CASE
    WHEN column_name = 'created_by' THEN 1
    WHEN column_name = 'createdby' THEN 2
    WHEN column_name = 'created_by_id' THEN 3
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

function listSchoolsForSuperAdminQuery({
  schoolNameColumn,
  schoolCodeColumn,
  ownerColumn,
  statusColumn,
  createdByColumn,
}) {
  const schoolNameSelectSql = schoolNameColumn
    ? `s."${schoolNameColumn}"::text AS school_name`
    : `NULL::text AS school_name`;
  const schoolCodeSelectSql = schoolCodeColumn
    ? `s."${schoolCodeColumn}"::text AS school_code`
    : `NULL::text AS school_code`;
  const ownerSelectSql = ownerColumn
    ? `s."${ownerColumn}"::text AS owner`
    : `NULL::text AS owner`;
  const statusSelectSql = statusColumn
    ? `s."${statusColumn}"::text AS status`
    : `NULL::text AS status`;
  const createdBySelectSql = createdByColumn
    ? `s."${createdByColumn}"::text AS created_by`
    : `NULL::text AS created_by`;

  return `
    SELECT
      ${schoolNameSelectSql},
      ${schoolCodeSelectSql},
      ${ownerSelectSql},
      ${statusSelectSql},
      ${createdBySelectSql}
    FROM "school" s
    ORDER BY school_name NULLS LAST, school_code NULLS LAST;
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

const FIND_STUDENTS_SCHOOL_ID_COLUMN = `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'students'
    AND column_name IN ('school_id', 'schoolid')
  ORDER BY CASE
    WHEN column_name = 'school_id' THEN 1
    WHEN column_name = 'schoolid' THEN 2
    ELSE 99
  END
  LIMIT 1;
`;

const FIND_STUDENTS_SCHOOL_CODE_COLUMN = `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'students'
    AND column_name IN ('school_code', 'schoolcode', 'code')
  ORDER BY CASE
    WHEN column_name = 'school_code' THEN 1
    WHEN column_name = 'schoolcode' THEN 2
    WHEN column_name = 'code' THEN 3
    ELSE 99
  END
  LIMIT 1;
`;

const FIND_STUDENTS_CLASS_COLUMN = `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'students'
    AND column_name IN (
      'class',
      'class_name',
      'classname',
      'standard',
      'grade',
      'class_id',
      'classid'
    )
  ORDER BY CASE
    WHEN column_name = 'class' THEN 1
    WHEN column_name = 'class_name' THEN 2
    WHEN column_name = 'classname' THEN 3
    WHEN column_name = 'standard' THEN 4
    WHEN column_name = 'grade' THEN 5
    WHEN column_name = 'class_id' THEN 6
    WHEN column_name = 'classid' THEN 7
    ELSE 99
  END
  LIMIT 1;
`;

const FIND_STUDENTS_PK_COLUMN = `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'students'
    AND column_name IN ('student_id', 'id')
  ORDER BY CASE
    WHEN column_name = 'student_id' THEN 1
    WHEN column_name = 'id' THEN 2
    ELSE 99
  END
  LIMIT 1;
`;

const FIND_STUDENTS_SECTION_ID_COLUMN = `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'students'
    AND column_name IN ('section_id', 'sectionid')
  ORDER BY CASE
    WHEN column_name = 'section_id' THEN 1
    WHEN column_name = 'sectionid' THEN 2
    ELSE 99
  END
  LIMIT 1;
`;

const FIND_SECTIONS_TABLE = `
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'sections'
  LIMIT 1;
`;

const FIND_SECTIONS_PK_COLUMN = `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'sections'
    AND column_name IN ('section_id', 'id')
  ORDER BY CASE
    WHEN column_name = 'section_id' THEN 1
    WHEN column_name = 'id' THEN 2
    ELSE 99
  END
  LIMIT 1;
`;

const FIND_SECTIONS_NAME_COLUMN = `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'sections'
    AND column_name IN ('section_name', 'name', 'title', 'section')
  ORDER BY CASE
    WHEN column_name = 'section_name' THEN 1
    WHEN column_name = 'name' THEN 2
    WHEN column_name = 'title' THEN 3
    WHEN column_name = 'section' THEN 4
    ELSE 99
  END
  LIMIT 1;
`;

const FIND_SECTIONS_CLASS_ID_COLUMN = `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'sections'
    AND column_name IN ('class_id', 'classid')
  ORDER BY CASE
    WHEN column_name = 'class_id' THEN 1
    WHEN column_name = 'classid' THEN 2
    ELSE 99
  END
  LIMIT 1;
`;

const FIND_STUDENT_ENROLLMENTS_TABLE = `
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'student_enrollments'
  LIMIT 1;
`;

const FIND_ENROLLMENTS_SCHOOL_ID_COLUMN = `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'student_enrollments'
    AND column_name IN ('school_id', 'schoolid')
  ORDER BY CASE
    WHEN column_name = 'school_id' THEN 1
    WHEN column_name = 'schoolid' THEN 2
    ELSE 99
  END
  LIMIT 1;
`;

const FIND_ENROLLMENTS_SCHOOL_CODE_COLUMN = `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'student_enrollments'
    AND column_name IN ('school_code', 'schoolcode', 'code')
  ORDER BY CASE
    WHEN column_name = 'school_code' THEN 1
    WHEN column_name = 'schoolcode' THEN 2
    WHEN column_name = 'code' THEN 3
    ELSE 99
  END
  LIMIT 1;
`;

const FIND_ENROLLMENTS_STUDENT_ID_COLUMN = `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'student_enrollments'
    AND column_name IN ('student_id', 'studentid')
  ORDER BY CASE
    WHEN column_name = 'student_id' THEN 1
    WHEN column_name = 'studentid' THEN 2
    ELSE 99
  END
  LIMIT 1;
`;

const FIND_ENROLLMENTS_CLASS_ID_COLUMN = `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'student_enrollments'
    AND column_name IN ('class_id', 'classid')
  ORDER BY CASE
    WHEN column_name = 'class_id' THEN 1
    WHEN column_name = 'classid' THEN 2
    ELSE 99
  END
  LIMIT 1;
`;

const FIND_ENROLLMENTS_CLASS_TEXT_COLUMN = `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'student_enrollments'
    AND column_name IN ('class', 'class_name', 'classname', 'standard', 'grade')
  ORDER BY CASE
    WHEN column_name = 'class' THEN 1
    WHEN column_name = 'class_name' THEN 2
    WHEN column_name = 'classname' THEN 3
    WHEN column_name = 'standard' THEN 4
    WHEN column_name = 'grade' THEN 5
    ELSE 99
  END
  LIMIT 1;
`;

const FIND_CLASSES_PK_COLUMN = `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'classes'
    AND column_name IN ('class_id', 'id')
  ORDER BY CASE
    WHEN column_name = 'class_id' THEN 1
    WHEN column_name = 'id' THEN 2
    ELSE 99
  END
  LIMIT 1;
`;

const FIND_CLASSES_NAME_COLUMN = `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'classes'
    AND column_name IN ('class_name', 'name', 'title', 'class')
  ORDER BY CASE
    WHEN column_name = 'class_name' THEN 1
    WHEN column_name = 'name' THEN 2
    WHEN column_name = 'title' THEN 3
    WHEN column_name = 'class' THEN 4
    ELSE 99
  END
  LIMIT 1;
`;

const FIND_USERS_TABLE = `
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'users'
  LIMIT 1;
`;

function listStudentsForSchoolQuery(filterColumn) {
  return `
    SELECT *
    FROM "students"
    WHERE "${filterColumn}"::text = $1::text
    ORDER BY 1;
  `;
}

function listClassIdToNameQuery(classPkColumn, classNameColumn) {
  return `
    SELECT
      "${classPkColumn}"::text AS class_id_value,
      "${classNameColumn}"::text AS class_name_value
    FROM "classes";
  `;
}

function listSectionClassMappingsBySectionIdsQuery({
  sectionPkColumn,
  sectionNameColumn,
  sectionClassIdColumn,
  classPkColumn,
  classNameColumn,
}) {
  return `
    SELECT
      s."${sectionPkColumn}"::text AS section_id_value,
      s."${sectionNameColumn}"::text AS section_name_value,
      s."${sectionClassIdColumn}"::text AS class_id_value,
      c."${classNameColumn}"::text AS class_name_value
    FROM "sections" s
    LEFT JOIN "classes" c
      ON c."${classPkColumn}"::text = s."${sectionClassIdColumn}"::text
    WHERE s."${sectionPkColumn}"::text = ANY($1::text[]);
  `;
}

function listEnrollmentClassMappingsQuery({
  schoolFilterColumn,
  studentIdColumn,
  classValueColumn,
}) {
  return `
    SELECT
      "${studentIdColumn}"::text AS student_id_value,
      "${classValueColumn}"::text AS class_value
    FROM "student_enrollments"
    WHERE "${schoolFilterColumn}"::text = $1::text;
  `;
}

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
  FIND_STUDENTS_SCHOOL_CODE_COLUMN,
  FIND_STUDENTS_CLASS_COLUMN,
  FIND_STUDENTS_PK_COLUMN,
  FIND_STUDENTS_SECTION_ID_COLUMN,
  FIND_SECTIONS_TABLE,
  FIND_SECTIONS_PK_COLUMN,
  FIND_SECTIONS_NAME_COLUMN,
  FIND_SECTIONS_CLASS_ID_COLUMN,
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
  listSectionClassMappingsBySectionIdsQuery,
  listEnrollmentClassMappingsQuery,
  listRolesQuery,
  listUsersForSchoolQuery,
};
