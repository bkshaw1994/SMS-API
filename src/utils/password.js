const crypto = require("crypto");
const bcrypt = require("bcrypt");

function generateTemporaryPassword() {
  return crypto.randomBytes(6).toString("base64");
}

function generateResetToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function hashPassword(plainTextPassword, saltRounds = 10) {
  return bcrypt.hash(plainTextPassword, saltRounds);
}

function isBcryptHash(value) {
  return /^\$2[aby]\$\d{2}\$/.test(String(value || "").trim());
}

async function verifyPassword(plainTextPassword, storedPassword) {
  const normalizedStoredPassword = String(storedPassword || "").trim();

  if (!normalizedStoredPassword) {
    return false;
  }

  if (isBcryptHash(normalizedStoredPassword)) {
    return bcrypt.compare(plainTextPassword, normalizedStoredPassword);
  }

  return plainTextPassword === normalizedStoredPassword;
}

module.exports = {
  generateTemporaryPassword,
  generateResetToken,
  hashPassword,
  verifyPassword,
};
