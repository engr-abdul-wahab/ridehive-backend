const { query, param, body, check } = require("express-validator");

const listUsersValidation = [
  query("page").optional().isInt({ min: 1 }).toInt(),
  query("limit").optional().isInt({ min: 1, max: 200 }).toInt(),
  query("search").optional().isString().trim(),
  query("status").optional().isIn(["active", "inactive", "blocked", "all"]),
];

const getUserValidation = [
  param("id").isMongoId().withMessage("Invalid user id"),
];

const updateUserValidation = [
  param("id").isMongoId().withMessage("Invalid user id"),

  // Optional fields
  body("fullName")
    .optional()
    .isString()
    .withMessage("fullName must be a string"),
  body("phone")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Phone cannot be empty")
    .matches(/^\+?[0-9\s\-()]{7,20}$/)
    .withMessage("Invalid phone number format")
    .isLength({ min: 7, max: 20 }),
  body("bio").optional().isString(),
  body("gender")
    .optional()
    .isIn(["male", "female", "other"])
    .withMessage("gender must be male, female, or other"),

  body("location")
    .optional()
    .custom((value) => {
      let loc = value;
      if (typeof value === "string") {
        try {
          loc = JSON.parse(value);
        } catch (e) {
          throw new Error("location must be a valid JSON object");
        }
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

  // Forbidden fields
  body("email")
    .not()
    .exists()
    .withMessage("You cannot change email via this endpoint"),
  body("role")
    .not()
    .exists()
    .withMessage("You cannot change role via this endpoint"),
  body("password")
    .not()
    .exists()
    .withMessage("You cannot change password via this endpoint"),

  // Profile image validation
  body("profileImage")
    .optional()
    .custom((value, { req }) => {
      if (!req.file) return true; // skip if not uploaded
      const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/jpg",
        "image/webp",
      ];
      if (!allowedTypes.includes(req.file.mimetype))
        throw new Error("Only JPEG, PNG, JPG, and WEBP images are allowed");

      const maxSize = 5 * 1024 * 1024;
      if (req.file.size > maxSize)
        throw new Error("Profile image size must be less than 5MB");

      return true;
    }),
];

const blockUserValidation = [
  param("id").isMongoId().withMessage("Invalid user id"),
  body("action")
    .isIn(["block", "unblock", "suspend"])
    .withMessage("action must be block|unblock|suspend"),
  body("reason").optional().isString(),
];

const userRidesValidation = [
  param("id").isMongoId().withMessage("Invalid user id"),
  query("page").optional().isInt({ min: 1 }).toInt(),
  query("limit").optional().isInt({ min: 1 }).toInt(),
];

module.exports = {
  listUsersValidation,
  getUserValidation,
  updateUserValidation,
  blockUserValidation,
  userRidesValidation,
};
