const dotenv = require("dotenv");

dotenv.config();

const config = {
  port: Number(process.env.APP_PORT || 3000),
  host: process.env.APP_HOST || "0.0.0.0",
  databaseUrl: process.env.DATABASE_URL,
  sslEnabled: (process.env.PG_SSL || "true").toLowerCase() === "true",
  jwtSecret: process.env.JWT_SECRET || "change-this-dev-secret",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1d",
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: (process.env.SMTP_SECURE || "false").toLowerCase() === "true",
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  smtpFrom: process.env.SMTP_FROM || "",
  resetPasswordBaseUrl:
    process.env.RESET_PASSWORD_BASE_URL ||
    "https://localhost:3000/reset-password",
  passwordSaltRounds: Number(process.env.PASSWORD_SALT_ROUNDS || 10),
};

if (!config.databaseUrl) {
  throw new Error("Missing DATABASE_URL in environment");
}

module.exports = config;
