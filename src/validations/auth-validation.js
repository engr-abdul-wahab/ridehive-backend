// src/validations/auth.validation.js
const { body } = require("express-validator");
const User = require("../models/User");

exports.signupValidation = [
  // note: multer should run before these if using multipart/form-data
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email format"),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters"),

  body("confirmPassword")
    .notEmpty()
    .withMessage("Confirm password is required")
    .custom((value, { req }) => value === req.body.password)
    .withMessage("Passwords do not match"),

  body("role")
    .optional()
    .isIn(["admin", "user", "driver"])
    .withMessage("Invalid role"),

  body("termsAccepted")
    .custom((value) => value === true || value === "true" || value === "1")
    .withMessage("You must accept the terms"),

  body("deviceType")
    .optional()
    .isIn(["android", "ios", "web"])
    .withMessage("Invalid device type"),

  body("deviceToken").optional().isString().withMessage("Invalid device token"),
];

exports.verifyOtpValidation = [
  body("userId")
    .trim()
    .notEmpty()
    .withMessage("userId is required")
    .isMongoId()
    .withMessage("Invalid userId"),

  body("code")
    .trim()
    .notEmpty()
    .withMessage("OTP code is required")
    .isNumeric()
    .withMessage("OTP code must be numeric")
    .isLength({ min: 6, max: 6 })
    .withMessage("OTP code must be 6 digits"),

  body("type").optional().isIn(["verify", "reset"]).withMessage("Invalid type"),
];

exports.resendOtpValidation = [
  body("userId")
    .optional()
    .notEmpty()
    .withMessage("userId must not be empty")
    .isMongoId()
    .withMessage("Invalid userId"),

  body("email")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("email must not be empty")
    .isEmail()
    .withMessage("Invalid email format"),

  body("type")
    .optional()
    .isIn(["verify", "reset"])
    .withMessage('Invalid type, must be "verify" or "reset"'),

  // ensure at least one identifier provided
  body().custom((body) => {
    if (!body.userId && !body.email) {
      throw new Error("Either userId or email is required");
    }
    return true;
  }),
];

exports.loginValidation = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email format"),

  body("password").notEmpty().withMessage("Password is required"),

  body("role").notEmpty().withMessage("Role is required"),
];

exports.forgotPasswordValidation = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email format"),
];

exports.verifyResetOtpValidation = [
  body("userId")
    .trim()
    .notEmpty()
    .withMessage("userId is required")
    .isMongoId()
    .withMessage("Invalid userId"),

  body("code")
    .trim()
    .notEmpty()
    .withMessage("OTP code is required")
    .isNumeric()
    .withMessage("OTP code must be numeric")
    .isLength({ min: 6, max: 6 })
    .withMessage("OTP code must be 6 digits"),
];

exports.resetPasswordValidation = [
  body("resetToken").trim().notEmpty().withMessage("resetToken is required"),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters"),

  body("confirmPassword")
    .notEmpty()
    .withMessage("Confirm password is required")
    .custom((val, { req }) => val === req.body.password)
    .withMessage("Passwords do not match"),
];

exports.socialLoginRules = [
  body("role")
    .notEmpty()
    .withMessage("Role field can't be empty")
    .bail()
    .isString()
    .withMessage("role must be string")
    .bail()
    .isIn(["user", "driver", "admin"])
    .withMessage("role must be one of: user, driver, admin"),

  body("socialToken")
    .notEmpty()
    .withMessage("User social token field can't be empty")
    .bail()
    .isString()
    .withMessage("socialToken must be a string"),

  body("socialType")
    .notEmpty()
    .withMessage("User social type field can't be empty")
    .bail()
    .isString()
    .withMessage("socialType must be a string")
    .bail()
    .isIn(["google", "apple", "other"])
    .withMessage("socialType must be google, apple or other"),

  body("fullName")
    .optional()
    .isString()
    .withMessage("fullName must be a string"),
  body("email")
    .trim()
    .custom(async (email, { req }) => {
      if (!email) {
        // Skip check here; email will be optional for existing users
        return true;
      }

      const user = await User.findOne({ email }).lean();
      if (!user) {
        // Email does not exist → required for new user
        if (!email) {
          throw new Error("Email is required for new user");
        }
      }

      return true;
    })
    .bail()
    .optional({ nullable: true, checkFalsy: true }) // <--- skip isEmail if empty
    .isEmail()
    .withMessage("Invalid email format"),
  body("phone").optional().isString(),
  body("deviceToken").optional().isString(),
  body("deviceType")
    .optional()
    .isIn(["ios", "android", "web"])
    .withMessage("deviceType must be ios|android|web"),
  body("profileImage").optional().isString(),
];
