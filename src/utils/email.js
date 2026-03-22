const nodemailer = require("nodemailer");

function createEmailClient({ host, port, secure, user, pass, from }) {
  async function sendWelcomeEmail({
    to,
    temporaryPassword,
    resetToken,
    resetPasswordBaseUrl,
  }) {
    if (!host || !port || !user || !pass || !from) {
      const error = new Error("Email transport is not configured");
      error.status = 500;
      error.details =
        "Missing SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM environment variables";
      throw error;
    }

    const transporter = nodemailer.createTransport({
      host,
      port: Number(port),
      secure: Boolean(secure),
      auth: {
        user,
        pass,
      },
    });

    const baseUrl =
      typeof resetPasswordBaseUrl === "string" && resetPasswordBaseUrl.trim()
        ? resetPasswordBaseUrl.trim()
        : "http://localhost:5000/auth/reset-password";
    const joiner = baseUrl.includes("?") ? "&" : "?";
    const resetLink = `${baseUrl}${joiner}token=${encodeURIComponent(resetToken)}`;

    const text = [
      "Welcome to the School Portal",
      "",
      `Temporary password: ${temporaryPassword}`,
      `Reset password link: ${resetLink}`,
      "",
      "You can login with the temporary password.",
      "You must change your password after login.",
    ].join("\n");

    await transporter.sendMail({
      from,
      to,
      subject: "Welcome to the School Portal",
      text,
    });
  }

  return {
    sendWelcomeEmail,
  };
}

module.exports = {
  createEmailClient,
};
