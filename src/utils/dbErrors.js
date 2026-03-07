const config = require("../config/env");

function getDatabaseHost() {
  try {
    return new URL(config.databaseUrl).hostname;
  } catch {
    return "unknown";
  }
}

function buildDbError(error, operation) {
  const hostName = getDatabaseHost();
  const payload = {
    error: operation,
    details: error.message,
  };

  if (error && error.code === "ENOTFOUND") {
    payload.hint = `Database host '${hostName}' could not be resolved. Verify DATABASE_URL from Supabase > Project Settings > Database > Connection string.`;
  }

  if (error && /Tenant or user not found/i.test(error.message || "")) {
    payload.hint =
      "Supabase pooler credentials are invalid for this host. Re-copy the exact pooler connection string from Supabase Dashboard (Project Settings > Database > Connection string). Ensure username is postgres.<project_ref>, host region matches your project, and database is /postgres.";
  }

  return payload;
}

module.exports = {
  buildDbError,
};
