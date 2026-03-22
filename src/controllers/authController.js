const jwt = require("jsonwebtoken");
const { hashPassword, verifyPassword } = require("../utils/password");

function renderResetPasswordDocument({ state = "ready", message = "" }) {
  const escapedMessage = JSON.stringify(String(message || ""));

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Reset Password</title>
    <style>
      body {
        margin: 0;
        font-family: Arial, sans-serif;
        background: #f4f7fb;
        color: #1f2937;
      }
      .wrap {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }
      .card {
        width: 100%;
        max-width: 420px;
        background: #ffffff;
        border-radius: 16px;
        box-shadow: 0 20px 45px rgba(15, 23, 42, 0.12);
        padding: 28px;
      }
      h1 {
        margin: 0 0 12px;
        font-size: 28px;
      }
      p {
        margin: 0 0 16px;
        line-height: 1.5;
      }
      form {
        display: grid;
        gap: 14px;
      }
      label {
        display: grid;
        gap: 6px;
        font-weight: 600;
      }
      input {
        padding: 12px 14px;
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        font-size: 16px;
      }
      button {
        border: 0;
        border-radius: 10px;
        padding: 12px 14px;
        background: #0f766e;
        color: #ffffff;
        font-size: 16px;
        font-weight: 700;
        cursor: pointer;
      }
      button:disabled {
        cursor: wait;
        opacity: 0.7;
      }
      .status {
        min-height: 24px;
        font-size: 14px;
      }
      .status.error {
        color: #b91c1c;
      }
      .status.success {
        color: #047857;
      }
      .hidden {
        display: none;
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h1>Reset Password</h1>
        <p id="intro"></p>
        <form id="reset-form">
          <label>
            New password
            <input id="newPassword" type="password" minlength="8" required />
          </label>
          <label>
            Confirm password
            <input id="confirmPassword" type="password" minlength="8" required />
          </label>
          <button id="submitButton" type="submit">Update password</button>
        </form>
        <p id="status" class="status"></p>
      </div>
    </div>
    <script>
      const state = ${JSON.stringify(state)};
      const message = ${escapedMessage};
      const form = document.getElementById("reset-form");
      const statusElement = document.getElementById("status");
      const introElement = document.getElementById("intro");
      const submitButton = document.getElementById("submitButton");
      const token = new URLSearchParams(window.location.search).get("token") || "";

      function setStatus(text, kind) {
        statusElement.textContent = text || "";
        statusElement.className = kind ? "status " + kind : "status";
      }

      if (state !== "ready") {
        introElement.textContent = message || "This reset link is not valid.";
        form.classList.add("hidden");
        setStatus("", "");
      } else {
        introElement.textContent = "Choose a new password for this account.";
        if (message) {
          setStatus(message, "success");
        }
      }

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const newPassword = document.getElementById("newPassword").value;
        const confirmPassword = document.getElementById("confirmPassword").value;

        submitButton.disabled = true;
        setStatus("Updating password...", "");

        try {
          const response = await fetch(window.location.pathname + window.location.search, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ newPassword, confirmPassword }),
          });

          const payload = await response.json();

          if (!response.ok) {
            setStatus(payload.error || "Failed to reset password", "error");
            return;
          }

          form.reset();
          form.classList.add("hidden");
          introElement.textContent = payload.message || "Password updated successfully.";
          setStatus("You can now log in with your new password.", "success");
        } catch (error) {
          setStatus("Failed to reach the server. Try again.", "error");
        } finally {
          submitButton.disabled = false;
        }
      });
    </script>
  </body>
</html>`;
}

function createAuthController({
  pool,
  buildDbError,
  findFirstExistingColumn,
  findExistingColumns,
  addTokenToBlacklist,
  jwtSecret,
  jwtExpiresIn,
  passwordSaltRounds = 10,
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

  async function resolveResetPasswordColumns() {
    const userIdColumn = await findFirstExistingColumn(pool, "users", [
      "user_id",
      "id",
    ]);
    const passwordColumn = await findFirstExistingColumn(pool, "users", [
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

    if (
      !userIdColumn ||
      !passwordColumn ||
      !mustChangePasswordColumn ||
      !resetTokenColumn ||
      !resetTokenExpiresColumn
    ) {
      const error = new Error("Reset password is not available");
      error.status = 500;
      error.details =
        "Required reset-password columns are missing in table 'users'";
      throw error;
    }

    return {
      userIdColumn,
      passwordColumn,
      tempPasswordHashColumn,
      mustChangePasswordColumn,
      resetTokenColumn,
      resetTokenExpiresColumn,
    };
  }

  async function findUserByResetToken(resetToken) {
    const columns = await resolveResetPasswordColumns();
    const result = await pool.query(
      `
        SELECT
          "${columns.userIdColumn}"::text AS user_id,
          "${columns.resetTokenExpiresColumn}" AS reset_token_expires
        FROM "users"
        WHERE "${columns.resetTokenColumn}" = $1
        LIMIT 1;
      `,
      [resetToken],
    );

    if (result.rowCount === 0) {
      return {
        columns,
        user: null,
      };
    }

    return {
      columns,
      user: result.rows[0],
    };
  }

  async function renderResetPasswordPage(req, res) {
    const token =
      typeof req.query?.token === "string" ? req.query.token.trim() : "";

    if (!token) {
      return res.status(400).send(
        renderResetPasswordDocument({
          state: "error",
          message: "Missing reset token in the link.",
        }),
      );
    }

    try {
      const { user } = await findUserByResetToken(token);

      if (!user) {
        return res.status(400).send(
          renderResetPasswordDocument({
            state: "error",
            message: "This reset link is invalid.",
          }),
        );
      }

      const expiresAt = user.reset_token_expires
        ? new Date(user.reset_token_expires)
        : null;
      if (
        !expiresAt ||
        Number.isNaN(expiresAt.getTime()) ||
        expiresAt <= new Date()
      ) {
        return res.status(400).send(
          renderResetPasswordDocument({
            state: "error",
            message: "This reset link has expired.",
          }),
        );
      }

      return res.send(renderResetPasswordDocument({ state: "ready" }));
    } catch {
      return res.status(500).send(
        renderResetPasswordDocument({
          state: "error",
          message: "Failed to load reset password page.",
        }),
      );
    }
  }

  async function resetPassword(req, res) {
    const tokenFromBody =
      typeof req.body?.token === "string" ? req.body.token.trim() : "";
    const tokenFromQuery =
      typeof req.query?.token === "string" ? req.query.token.trim() : "";
    const token = tokenFromBody || tokenFromQuery;
    const newPassword =
      typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
    const confirmPassword =
      typeof req.body?.confirmPassword === "string"
        ? req.body.confirmPassword
        : "";

    if (!token || !newPassword || !confirmPassword) {
      return res.status(400).json({
        error: "token, newPassword, and confirmPassword are required",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        error: "New password must be at least 8 characters long",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        error: "New password and confirmPassword must match",
      });
    }

    try {
      const { columns, user } = await findUserByResetToken(token);

      if (!user) {
        return res.status(400).json({
          error: "Invalid reset token",
        });
      }

      const expiresAt = user.reset_token_expires
        ? new Date(user.reset_token_expires)
        : null;
      if (
        !expiresAt ||
        Number.isNaN(expiresAt.getTime()) ||
        expiresAt <= new Date()
      ) {
        return res.status(400).json({
          error: "Reset token has expired",
        });
      }

      const passwordHash = await hashPassword(
        newPassword,
        Number(passwordSaltRounds),
      );
      const setClauses = [
        `"${columns.passwordColumn}" = $1`,
        `"${columns.mustChangePasswordColumn}" = $2`,
        `"${columns.resetTokenColumn}" = $3`,
        `"${columns.resetTokenExpiresColumn}" = $4`,
      ];
      const values = [passwordHash, false, null, null];

      if (columns.tempPasswordHashColumn) {
        setClauses.push(`"${columns.tempPasswordHashColumn}" = $5`);
        values.push(null);
      }

      values.push(user.user_id);

      await pool.query(
        `
          UPDATE "users"
          SET ${setClauses.join(", ")}
          WHERE "${columns.userIdColumn}"::text = $${values.length}::text;
        `,
        values,
      );

      return res.json({
        success: true,
        message: "Password updated successfully",
      });
    } catch (error) {
      return res.status(error?.status || 500).json({
        error: "Failed to reset password",
      });
    }
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

      const passwordValid = await verifyPassword(
        password,
        String(storedPassword),
      );
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

      const passwordValid = await verifyPassword(
        password,
        String(storedPassword),
      );
      if (!passwordValid) {
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
    renderResetPasswordPage,
    resetPassword,
    validateLogin,
    superAdminLogin,
    logout,
  };
}

module.exports = {
  createAuthController,
};
