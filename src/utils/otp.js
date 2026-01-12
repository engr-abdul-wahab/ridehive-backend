const path = require("path");
const OTPModel = require("../models/OTP");
const { renderTemplate } = require("./templateRenderer");
const { sendMail } = require("./mailer");

const OTP_EXPIRY_SECONDS = Number(process.env.OTP_EXPIRY_SECONDS || 60);

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function createAndSendOtp(user, opts = {}) {
  const type = opts.type || "verify";
  // const code = generateOtp();
  const code = 123456;
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000);

  // Save OTP
  await OTPModel.create({ user: user._id, code, type, expiresAt });

  // // Render template — pass only the filename because renderTemplate already uses ../templates
  // const html = renderTemplate('otp-email.html', {
  //   otp: code,
  //   expirySeconds: OTP_EXPIRY_SECONDS,
  // });

  // // Send email
  // await sendMail({ to: user.email, subject: 'Your verification code', html });

  return { code, expiresAt };
}

module.exports = { createAndSendOtp, generateOtp };
