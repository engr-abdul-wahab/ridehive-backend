// src/validations/profile-validation.js
const { body, check } = require("express-validator");

exports.createProfileValidation = [
  body("fullName")
    .trim()
    .notEmpty()
    .withMessage("Full name is required")
    .isLength({ max: 100 })
    .withMessage("Full name too long"),

  body("phone")
    .trim()
    .notEmpty()
    .withMessage("Phone number is required")
    // Allow +1, parentheses, dashes, spaces
    .matches(/^(\+1\s?)?(\(?\d{3}\)?[\s-]?)?\d{3}[\s-]?\d{4}$/)
    .withMessage("Invalid US phone number format")
    .customSanitizer((value) => {
      // remove all non-digits
      let digits = value.replace(/\D/g, "");
      // remove leading 1 if number starts with country code
      if (digits.length === 11 && digits.startsWith("1")) {
        digits = digits.substring(1);
      }
      return digits;
    })
    .isLength({ min: 10, max: 10 })
    .withMessage("US phone number must have 10 digits"),

  body("gender")
    .notEmpty()
    .withMessage("Gender is required")
    .isIn(["male", "female", "other"])
    .withMessage("Invalid gender"),

  body("bio")
    .trim()
    .notEmpty()
    .withMessage("Bio is required")
    .isLength({ max: 500 })
    .withMessage("Bio must be at most 500 characters"),

  // location is expected as JSON string if using multipart/form-data
  body("location")
    .notEmpty()
    .withMessage("Location is required")
    .custom((value) => {
      let loc;
      try {
        loc = typeof value === "string" ? JSON.parse(value) : value;
      } catch (e) {
        throw new Error("Location must be a valid JSON object");
      }
      if (!loc.address || typeof loc.address !== "string")
        throw new Error("Location.address is required");
      if (typeof loc.lat !== "number" && isNaN(Number(loc.lat)))
        throw new Error("Location.lat is required and must be numeric");
      if (typeof loc.lng !== "number" && isNaN(Number(loc.lng)))
        throw new Error("Location.lng is required and must be numeric");
      return true;
    }),

  // optional: role can be included in the body
  body("role")
    .optional()
    .isIn(["user", "driver", "admin"])
    .withMessage("Invalid role"),

  // ✅ profileImage validation
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
