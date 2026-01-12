// src/validations/admin-validation.js
const { body, check } = require("express-validator");

const loginValidation = [
  body("email").isEmail().withMessage("Valid email is required"),
  body("password").isString().notEmpty().withMessage("Password is required"),
];

const changePasswordValidation = [
  body("oldPassword")
    .notEmpty()
    .withMessage("Old password is required")
    .isString()
    .withMessage("Old password must be a string"),

  body("newPassword")
    .notEmpty()
    .withMessage("New password is required")
    .isString()
    .withMessage("New password must be a string")
    .isLength({ min: 8, max: 128 })
    .withMessage("New password must be between 8 and 128 characters.")
    .matches(/(?=.*[a-z])/)
    .withMessage("New password must contain at least one lowercase letter.")
    .matches(/(?=.*[A-Z])/)
    .withMessage("New password must contain at least one uppercase letter.")
    .matches(/(?=.*\d)/)
    .withMessage("New password must contain at least one digit."),
];

const updateProfileValidation = [
  // Reject attempts to change email/role
  body("email")
    .not()
    .exists()
    .withMessage("You are not allowed to change email via this endpoint"),
  body("role")
    .not()
    .exists()
    .withMessage("You are not allowed to change role via this endpoint"),

  // Allowed fields (all optional)
  body("fullName")
    .optional()
    .isString()
    .withMessage("fullName must be a string"),

  body("phone")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Phone number cannot be empty")
    .matches(/^\+?[0-9\s\-()]{7,20}$/)
    .withMessage("Invalid phone number format")
    .customSanitizer((value) => {
      let digits = value.replace(/\D/g, "");
      if (digits.startsWith("00")) digits = digits.substring(2);
      if (digits.length === 11 && digits.startsWith("1")) {
        digits = digits.substring(1);
      }
      return digits;
    })
    .isLength({ min: 10, max: 15 })
    .withMessage("Phone number must contain between 10 and 15 digits"),

  body("gender")
    .optional()
    .isIn(["male", "female", "other", null])
    .withMessage("gender must be one of male, female or other"),

  body("bio").optional().isString().withMessage("bio must be a string"),

  body("location")
    .optional()
    .custom((value) => {
      let loc;
      try {
        loc = typeof value === "string" ? JSON.parse(value) : value;
      } catch (e) {
        throw new Error("location must be a valid JSON object");
      }

      if (!loc.type || loc.type !== "Point")
        throw new Error('location.type must equal "Point"');
      if (!Array.isArray(loc.coordinates) || loc.coordinates.length !== 2)
        throw new Error(
          "location.coordinates must be an array of two numbers [lng, lat]"
        );
      if (loc.address && typeof loc.address !== "string")
        throw new Error("location.address must be a string");

      return true;
    }),

  check("profileImage")
    .optional()
    .custom((value, { req }) => {
      if (!req.file) {
        throw new Error("Profile image is required");
      }

      const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/jpg",
        "image/webp",
      ];
      if (!allowedTypes.includes(req.file.mimetype)) {
        throw new Error("Only JPEG, PNG, JPG, and WEBP images are allowed");
      }

      // Max 5MB
      const maxSize = 5 * 1024 * 1024;
      if (req.file.size > maxSize) {
        throw new Error("Profile image size must be less than 5MB");
      }

      return true;
    }),
];

module.exports = {
  loginValidation,
  changePasswordValidation,
  updateProfileValidation,
};
