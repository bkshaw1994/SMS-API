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
        responses: {
          200: { description: "API is running" },
        },
      },
    },
    "/db/health": {
      get: {
        summary: "Database connectivity check",
        responses: {
          200: { description: "Database is reachable" },
          500: { description: "Database connection failed" },
        },
      },
    },
    "/tables": {
      get: {
        summary: "List public schema tables",
        responses: {
          200: { description: "List of table names" },
          500: { description: "Database query failed" },
        },
      },
    },
    "/roles": {
      get: {
        summary: "Fetch roles filtered by JWT role",
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
    },
    "/superadmin/schools/{schoolCode}/students/classwise": {
      get: {
        summary: "SUPERADMIN-only class-wise students list for a school",
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
              "Returns students grouped class-wise for the given school code",
          },
          400: { description: "Invalid or missing schoolCode" },
          401: { description: "Unauthorized (missing/invalid token)" },
          403: { description: "Forbidden (caller is not SUPERADMIN)" },
          404: { description: "School not found" },
          500: { description: "Database query failed" },
        },
      },
    },
    "/superadmin/schools/{schoolCode}/teachers": {
      get: {
        summary: "SUPERADMIN-only teacher details for a school",
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
    "/auth/logout": {
      post: {
        summary: "Logout current user",
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
