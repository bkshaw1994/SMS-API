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

module.exports = {
  generateTemporaryPassword,
  generateResetToken,
  hashPassword,
};
