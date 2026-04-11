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

  async function sendOtpEmail({ to, otp }) {
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

    const text = [
      "You requested a password reset for your School Portal account.",
      "",
      `Your OTP is: ${otp}`,
      "",
      "This OTP is valid for 10 minutes.",
      "If you did not request this, please ignore this email.",
    ].join("\n");

    await transporter.sendMail({
      from,
      to,
      subject: "Your Password Reset OTP",
      text,
    });
  }

  return {
    sendWelcomeEmail,
    sendOtpEmail,
  };
}

module.exports = {
  createEmailClient,
};
