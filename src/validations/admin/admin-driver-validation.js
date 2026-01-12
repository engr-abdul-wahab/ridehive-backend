const { query, param, body } = require("express-validator");

const listDriversValidation = [
  query("page").optional().isInt({ min: 1 }).toInt(),
  query("limit").optional().isInt({ min: 1, max: 200 }).toInt(),
  query("search").optional().isString().trim(),
  query("status")
    .optional()
    .isIn(["pending", "approved", "rejected", "blocked", "all"]),
];

const getDriverValidation = [
  param("id").isMongoId().withMessage("Invalid driver id"),
];

const updateDriverValidation = [
  param("id").isMongoId().withMessage("Invalid driver id"),

  // Allowed fields
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
    .withMessage("Invalid phone number"),
  body("bio").optional().isString(),
  body("gender")
    .optional()
    .isIn(["male", "female", "other"])
    .withMessage("gender must be one of male|female|other"),

  // location may be JSON string or object
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

      if (!loc || loc.type !== "Point")
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
    .withMessage("You are not allowed to change email via this endpoint"),
  body("role")
    .not()
    .exists()
    .withMessage("You are not allowed to change role via this endpoint"),
  body("password")
    .not()
    .exists()
    .withMessage("You are not allowed to change password via this endpoint"),

  // profileImage validation via req.file presence
  body("profileImage")
    .optional()
    .custom((val, { req }) => {
      if (!req.file) return true;
      const allowed = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
      if (!allowed.includes(req.file.mimetype))
        throw new Error("Only JPEG, PNG, JPG, and WEBP images are allowed");
      const maxSize = 5 * 1024 * 1024;
      if (req.file.size > maxSize)
        throw new Error("Profile image must be less than 5MB");
      return true;
    }),
];

const approveDriverValidation = [
  param("id").isMongoId().withMessage("Invalid driver id"),
  body("action")
    .isIn(["approve", "reject"])
    .withMessage("action must be approve or reject"),
  body("reason").optional().isString(),
];

const blockDriverValidation = [
  param("id").isMongoId().withMessage("Invalid driver id"),
  body("action")
    .isIn(["block", "unblock"])
    .withMessage("action must be block or unblock"),
  body("reason").optional().isString(),
];

const driverRidesValidation = [
  param("id").isMongoId().withMessage("Invalid driver id"),
  query("page").optional().isInt({ min: 1 }).toInt(),
  query("limit").optional().isInt({ min: 1 }).toInt(),
];

module.exports = {
  listDriversValidation,
  getDriverValidation,
  updateDriverValidation,
  approveDriverValidation,
  blockDriverValidation,
  driverRidesValidation,
};
