// src/routes/auth.routes.js
const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth-controller");
const auth = require("../middlewares/auth-middleware");
const roleMiddleware = require("../middlewares/role-middleware");

const {
  signupValidation,
  verifyOtpValidation,
  resendOtpValidation,
  loginValidation,
  forgotPasswordValidation,
  verifyResetOtpValidation,
  resetPasswordValidation,
  socialLoginRules,
} = require("../validations/auth-validation");

const validate = require("../middlewares/validate");
const upload = require("../middlewares/multer-middleware");

router.post(
  "/signup",
  upload.none(),
  signupValidation,
  validate,
  authController.signUp
);
router.post(
  "/verify-otp",
  upload.none(),
  verifyOtpValidation,
  validate,
  authController.verifyOtp
);
router.post(
  "/resend-otp",
  upload.none(),
  resendOtpValidation,
  validate,
  authController.resendOtp
);
router.post(
  "/login",
  upload.none(),
  loginValidation,
  validate,
  authController.login
);
router.post(
  "/forgot-password",
  upload.none(),
  forgotPasswordValidation,
  validate,
  authController.forgotPassword
);
router.post(
  "/verify-reset-otp",
  upload.none(),
  verifyResetOtpValidation,
  validate,
  authController.verifyResetOtp
);
router.post(
  "/reset-password",
  upload.none(),
  resetPasswordValidation,
  validate,
  authController.resetPassword
);
router.post(
  "/social-login",
  upload.none(),
  socialLoginRules,
  validate,
  authController.socialLogin
);
router.post(
  "/logout",
  auth,
  roleMiddleware(["user", "driver"]),
  upload.none(),
  authController.logout
);

module.exports = router;
