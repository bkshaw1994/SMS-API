const swaggerJSDoc = require("swagger-jsdoc");

function getSwaggerSpec(port) {
  const swaggerSpec = swaggerJSDoc({
    definition: {
      openapi: "3.0.3",
      info: {
        title: "School Management System API",
        version: "1.0.0",
        description:
          "SMS API with health, metadata, school-code and login validation endpoints",
      },
      servers: [{ url: `http://localhost:${port}` }],
      tags: [
        {
          name: "Auth",
          description: "Authentication and session endpoints",
        },
        {
          name: "System",
          description: "Health checks and system metadata endpoints",
        },
        {
          name: "SuperAdmin",
          description: "Endpoints accessible to SUPERADMIN role",
        },
        {
          name: "Owner",
          description: "Endpoints intended for OWNER role workflows",
        },
        {
          name: "ITAdmin",
          description: "Endpoints accessible to ITADMIN role",
        },
        {
          name: "Teacher",
          description: "Endpoints accessible to TEACHER role",
        },
        {
          name: "Parent",
          description: "Endpoints intended for PARENT role workflows",
        },
        {
          name: "Student",
          description: "Endpoints intended for STUDENT role workflows",
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
    apis: [],
  });

  swaggerSpec.paths = {
    "/health": {
      get: {
        summary: "API health check",
        tags: ["System"],
        responses: {
          200: { description: "API is running" },
        },
      },
    },
    "/db/health": {
      get: {
        summary: "Database connectivity check",
        tags: ["System"],
        responses: {
          200: { description: "Database is reachable" },
          500: { description: "Database connection failed" },
        },
      },
    },
    "/tables": {
      get: {
        summary: "List public schema tables",
        tags: ["System"],
        responses: {
          200: { description: "List of table names" },
          500: { description: "Database query failed" },
        },
      },
    },
    "/roles": {
      get: {
        summary: "Fetch roles filtered by JWT role",
        tags: ["System"],
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description:
              "Roles fetched based on caller role from JWT. SUPERADMIN => OWNER, OWNER => ITADMIN, ITADMIN => TEACHER/PARENT/STUDENT, others => empty list.",
          },
          401: { description: "Unauthorized (missing/invalid token)" },
          404: { description: "Roles table not found" },
          500: { description: "Database query failed" },
        },
      },
    },
    "/superadmin/schools": {
      get: {
        summary:
          "SUPERADMIN-only endpoint to list schools with school_name, school_code, owner, status, and created_by",
        tags: ["SuperAdmin"],
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description:
              "Returns all schools with school_name, school_code, owner, status, and created_by",
          },
          401: { description: "Unauthorized (missing/invalid token)" },
          403: { description: "Forbidden (caller is not SUPERADMIN)" },
          500: { description: "Database query failed" },
        },
      },
      post: {
        summary: "SUPERADMIN-only endpoint to add a school",
        tags: ["SuperAdmin"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: [
                  "schoolName",
                  "schoolCode",
                  "address",
                  "number",
                  "website",
                  "city",
                  "state",
                  "schoolEmail",
                ],
                properties: {
                  schoolName: { type: "string", example: "ABC Public School" },
                  schoolCode: { type: "string", example: "ABC001" },
                  address: { type: "string", example: "Main Road, City" },
                  number: { type: "string", example: "9876543210" },
                  website: {
                    type: "string",
                    example: "https://abcschool.com",
                  },
                  city: { type: "string", example: "Pune" },
                  state: { type: "string", example: "Maharashtra" },
                  schoolEmail: {
                    type: "string",
                    example: "info@abcschool.com",
                  },
                  schoolEmailId: {
                    type: "string",
                    example: "info@abcschool.com",
                    description: "Alias for schoolEmail supported by API",
                  },
                  schhoolEmail: {
                    type: "string",
                    example: "info@abcschool.com",
                    description:
                      "Legacy typo alias for schoolEmail supported by API",
                  },
                  schhoolEmailId: {
                    type: "string",
                    example: "info@abcschool.com",
                    description:
                      "Legacy typo alias for schoolEmail supported by API",
                  },
                  logoImage: {
                    type: "string",
                    example: "https://cdn.example.com/logo.png",
                    description: "Optional school logo URL",
                  },
                  status: {
                    type: "string",
                    example: "ACTIVE",
                    description: "Optional. Defaults to ACTIVE.",
                  },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "School added successfully" },
          400: { description: "Invalid request body" },
          401: { description: "Unauthorized (missing/invalid token/userId)" },
          403: { description: "Forbidden (caller is not SUPERADMIN)" },
          409: { description: "School already exists" },
          500: { description: "Database insert failed" },
        },
      },
    },
    "/superadmin/schools/owner": {
      post: {
        summary: "SUPERADMIN-only endpoint to add an OWNER for any school",
        tags: ["SuperAdmin", "Owner"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["schoolCode", "name", "email", "phone"],
                properties: {
                  schoolCode: { type: "string", example: "ABC001" },
                  name: { type: "string", example: "Owner Name" },
                  email: { type: "string", example: "owner@abcschool.com" },
                  phone: { type: "string", example: "9876543210" },
                  status: {
                    type: "string",
                    example: "ACTIVE",
                    description: "Optional. Defaults to ACTIVE.",
                  },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description:
              "Owner user created and linked to school. API always returns generatedPassword.",
          },
          400: { description: "Invalid request body or role mapping" },
          401: { description: "Unauthorized (missing/invalid token/userId)" },
          403: { description: "Forbidden (caller is not SUPERADMIN)" },
          404: { description: "School not found" },
          409: {
            description: "Owner already exists for the school with same email",
          },
          500: { description: "Database insert failed" },
        },
      },
    },
    "/superadmin/schools/{schoolCode}/students/classwise": {
      get: {
        summary:
          "Class-section wise student count using students.section_id -> sections -> classes",
        tags: ["SuperAdmin", "Student"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "path",
            name: "schoolCode",
            required: true,
            schema: { type: "string" },
            description:
              "School code in path. API also supports resolving school from JWT schoolCode.",
          },
        ],
        responses: {
          200: {
            description:
              "Returns class + section summary with student counts for the school",
          },
          400: {
            description:
              "schoolCode is missing from both JWT and path, or invalid request",
          },
          401: { description: "Unauthorized (missing/invalid token)" },
          403: {
            description:
              "Forbidden for cross-school access when non-SUPERADMIN user passes different schoolCode",
          },
          404: { description: "School not found" },
          500: { description: "Database query failed" },
        },
      },
    },
    "/superadmin/schools/{schoolCode}/teachers": {
      get: {
        summary: "SUPERADMIN-only teacher details for a school",
        tags: ["SuperAdmin", "Teacher"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "path",
            name: "schoolCode",
            required: true,
            schema: { type: "string" },
            description: "School code",
          },
        ],
        responses: {
          200: {
            description:
              "Returns teacher details (from users table role-filtered by TEACHER) for the given school",
          },
          400: { description: "Invalid or missing schoolCode" },
          401: { description: "Unauthorized (missing/invalid token)" },
          403: { description: "Forbidden (caller is not SUPERADMIN)" },
          404: { description: "School not found" },
          500: { description: "Database query failed" },
        },
      },
    },
    "/superadmin/schools/{schoolCode}/parents": {
      get: {
        summary: "SUPERADMIN-only parent details for a school",
        tags: ["SuperAdmin", "Parent"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "path",
            name: "schoolCode",
            required: true,
            schema: { type: "string" },
            description: "School code",
          },
        ],
        responses: {
          200: {
            description:
              "Returns parent details (from users table role-filtered by PARENT) for the given school",
          },
          400: { description: "Invalid or missing schoolCode" },
          401: { description: "Unauthorized (missing/invalid token)" },
          403: { description: "Forbidden (caller is not SUPERADMIN)" },
          404: { description: "School not found" },
          500: { description: "Database query failed" },
        },
      },
    },
    "/superadmin/schools/{schoolCode}/owners-itadmin": {
      get: {
        summary: "SUPERADMIN-only OWNER and ITADMIN details for a school",
        tags: ["SuperAdmin", "Owner", "ITAdmin"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "path",
            name: "schoolCode",
            required: true,
            schema: { type: "string" },
            description: "School code",
          },
        ],
        responses: {
          200: {
            description:
              "Returns separate owners and itadmins arrays (plus combined users) for the given school",
          },
          400: { description: "Invalid or missing schoolCode" },
          401: { description: "Unauthorized (missing/invalid token)" },
          403: { description: "Forbidden (caller is not SUPERADMIN)" },
          404: { description: "School not found" },
          500: { description: "Database query failed" },
        },
      },
    },
    "/itadmin/users": {
      get: {
        summary: "List users for ITADMIN's school",
        tags: ["ITAdmin"],
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description:
              "Returns users associated with the ITADMIN caller's school with only name, email, phone, whatsapp, and role",
          },
          400: { description: "Invalid token payload (missing schoolCode)" },
          401: { description: "Unauthorized (missing/invalid token)" },
          403: { description: "Forbidden (caller is not ITADMIN)" },
          404: { description: "School not found for token schoolCode" },
          500: { description: "Database query failed" },
        },
      },
    },
    "/school/validate-code": {
      post: {
        summary: "Validate school code",
        tags: ["System"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["schoolCode"],
                properties: {
                  schoolCode: { type: "string", example: "SCH001" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Validation result" },
          400: { description: "Invalid request body" },
          500: { description: "Database query failed" },
        },
      },
    },
    "/auth/validate-login": {
      post: {
        summary: "Validate login details for an entered school",
        tags: ["Auth"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["schoolCode", "email", "password"],
                properties: {
                  schoolCode: { type: "string", example: "SCH001" },
                  email: { type: "string", example: "teacher01@example.com" },
                  password: { type: "string", example: "secret123" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description:
              "Login validation result. Successful response includes JWT token, userId, role, name, and phone.",
          },
          400: { description: "Invalid request body" },
          500: { description: "Database query failed" },
        },
      },
    },
    "/auth/superadmin/login": {
      post: {
        summary: "SUPERADMIN login without school code verification",
        tags: ["Auth", "SuperAdmin"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", example: "superadmin@example.com" },
                  password: { type: "string", example: "secret123" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description:
              "Superadmin login validation result. Successful response includes JWT token, userId, role, name, and phone.",
          },
          400: { description: "Invalid request body" },
          403: { description: "Forbidden (user is not SUPERADMIN)" },
          500: { description: "Database query failed" },
        },
      },
    },
    "/users": {
      post: {
        summary: "Add user",
        tags: ["SuperAdmin", "Owner", "ITAdmin"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["schoolCode", "name", "email", "phone", "role"],
                properties: {
                  schoolCode: { type: "string", example: "SCH001" },
                  name: { type: "string", example: "John Doe" },
                  email: { type: "string", example: "john@example.com" },
                  phone: { type: "string", example: "9876543210" },
                  role: { type: "string", example: "TEACHER" },
                  status: { type: "string", example: "ACTIVE" },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description:
              "User added successfully with school_id, name, email, phone, status, role_id, password, and created_by. Response includes generatedPassword.",
          },
          400: { description: "Invalid request body" },
          401: { description: "Unauthorized (missing token or token userId)" },
          500: { description: "Database insert failed" },
        },
      },
    },
    "/teacher/classes-assigned": {
      get: {
        summary: "TEACHER-only endpoint to list assigned classes and sections",
        tags: ["Teacher"],
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description:
              "Resolves JWT userId to teachers.teacher_id using teachers.user_id, then returns section_id, class_name, and section_name rows assigned to that teacher",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    teacherId: { type: "integer", example: 1 },
                    classes: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          section_id: { type: "integer", example: 12 },
                          class_name: { type: "string", example: "10" },
                          section_name: { type: "string", example: "A" },
                        },
                      },
                    },
                  },
                },
                examples: {
                  assignedSections: {
                    summary: "Assigned sections for logged-in teacher",
                    value: {
                      teacherId: 1,
                      classes: [
                        {
                          section_id: 12,
                          class_name: "10",
                          section_name: "A",
                        },
                        {
                          section_id: 13,
                          class_name: "10",
                          section_name: "B",
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
          401: {
            description:
              "Unauthorized (missing/invalid token or missing userId in token)",
          },
          403: { description: "Forbidden (caller is not TEACHER)" },
          404: {
            description: "No teacher record found for the logged-in user",
          },
          500: { description: "Database query failed" },
        },
      },
    },
    "/teacher/sections/{sectionId}/students": {
      get: {
        summary:
          "TEACHER-only endpoint to list students for an assigned section",
        tags: ["Teacher"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "path",
            name: "sectionId",
            required: true,
            schema: { type: "string" },
            description: "Section ID to fetch students for",
          },
        ],
        responses: {
          200: {
            description:
              "Resolves JWT userId to teachers.teacher_id, verifies the section belongs to that teacher, then returns students for the given section_id",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    teacherId: { type: "integer", example: 1 },
                    sectionId: { type: "string", example: "12" },
                    students: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          student_id: { type: "integer", example: 101 },
                          user_id: { type: "integer", example: 220 },
                          admission_no: { type: "string", example: "ADM001" },
                          roll_no: { type: "integer", example: 1 },
                          name: { type: "string", example: "Rahul Sharma" },
                          email: {
                            type: "string",
                            example: "rahul@example.com",
                          },
                          phone: { type: "string", example: "9876543210" },
                          whatsapp: { type: "string", example: "9876543210" },
                        },
                      },
                    },
                  },
                },
                examples: {
                  sectionWiseStudents: {
                    summary: "Students for one section",
                    value: {
                      teacherId: 1,
                      sectionId: "12",
                      students: [
                        {
                          student_id: 101,
                          user_id: 220,
                          admission_no: "ADM001",
                          roll_no: 1,
                          name: "Rahul Sharma",
                          email: "rahul@example.com",
                          phone: "9876543210",
                          whatsapp: "9876543210",
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
          400: { description: "Missing sectionId" },
          401: {
            description:
              "Unauthorized (missing/invalid token or missing userId in token)",
          },
          403: { description: "Forbidden (caller is not TEACHER)" },
          404: {
            description:
              "No teacher record found for the logged-in user, or the section is not assigned to that teacher",
          },
          500: { description: "Database query failed" },
        },
      },
    },
    "/auth/logout": {
      post: {
        summary: "Logout current user",
        tags: ["Auth"],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "Logout success" },
          401: {
            description: "Unauthorized (missing/invalid/logged-out token)",
          },
          500: { description: "Logout failed" },
        },
      },
    },
  };

  return swaggerSpec;
}

module.exports = {
  getSwaggerSpec,
};
