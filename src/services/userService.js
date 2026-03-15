const {
  generateTemporaryPassword,
  generateResetToken,
  hashPassword,
} = require("../utils/password");

function createUserService({
  userDb,
  emailClient,
  resetPasswordBaseUrl,
  passwordSaltRounds = 10,
}) {
  async function createUserWithTemporaryPassword({
    schoolCode,
    name,
    email,
    phone,
    status,
    role,
    createdBy,
  }) {
    if (!schoolCode || !name || !email || !role || !createdBy) {
      const error = new Error(
        "schoolCode, name, email, role, and token userId are required",
      );
      error.status = 400;
      throw error;
    }

    const school = await userDb.resolveSchoolByCode(schoolCode);
    let roleId = null;
    try {
      roleId = await userDb.resolveRoleIdByName(role);
    } catch (error) {
      const details = String(error?.details || "");
      const canSkipRoleIdResolution =
        details.includes("Roles table not found") ||
        details.includes("role name/id columns");

      if (!canSkipRoleIdResolution) {
        throw error;
      }
    }

    const temporaryPassword = generateTemporaryPassword();
    const tempPasswordHash = await hashPassword(
      temporaryPassword,
      Number(passwordSaltRounds),
    );
    const resetToken = generateResetToken();
    const resetTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await userDb.createUser({
      schoolId: school.schoolPkValue,
      name,
      email,
      phone,
      status,
      role,
      roleId,
      createdBy,
      passwordHash: tempPasswordHash,
      tempPasswordHash,
      mustChangePassword: true,
      resetToken,
      resetTokenExpires,
    });

    await emailClient.sendWelcomeEmail({
      to: email,
      temporaryPassword,
      resetToken,
      resetPasswordBaseUrl,
    });

    return {
      user,
    };
  }

  return {
    createUserWithTemporaryPassword,
  };
}

module.exports = {
  createUserService,
};
