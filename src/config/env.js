const dotenv = require("dotenv");

dotenv.config();

const config = {
  port: Number(process.env.APP_PORT || 3000),
  host: process.env.APP_HOST || "0.0.0.0",
  databaseUrl: process.env.DATABASE_URL,
  sslEnabled: (process.env.PG_SSL || "true").toLowerCase() === "true",
  jwtSecret: process.env.JWT_SECRET || "change-this-dev-secret",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1d",
};

if (!config.databaseUrl) {
  throw new Error("Missing DATABASE_URL in environment");
}

module.exports = config;
