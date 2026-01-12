const { body, query } = require("express-validator");

const sendNotificationValidation = [
  body("title").notEmpty().withMessage("Title is required").isString(),

  body("message").notEmpty().withMessage("Message is required").isString(),

  body("targetRoles")
    .optional()
    .custom((val) => {
      const allowedRoles = ["user", "driver"];

      let roles = [];

      if (Array.isArray(val)) {
        roles = val;
      } else if (typeof val === "string") {
        roles = val.split(",").map((r) => r.trim());
      } else {
        throw new Error(
          "targetRoles must be an array or comma-separated string"
        );
      }

      const invalid = roles.filter((r) => !allowedRoles.includes(r));
      if (invalid.length) {
        throw new Error(`Invalid role(s): ${invalid.join(", ")}`);
      }

      return true;
    }),

  body("data")
    .optional()
    .custom((val) => {
      if (typeof val === "object") return true;
      if (typeof val === "string") {
        try {
          JSON.parse(val);
          return true;
        } catch {
          throw new Error("data must be a valid JSON object");
        }
      }
      throw new Error("data must be an object");
    }),
];

const listNotificationsValidation = [
  query("page").optional().isInt({ min: 1 }).toInt(),
  query("limit").optional().isInt({ min: 1, max: 200 }).toInt(),
  query("receiverRole")
    .optional()
    .isIn(["user", "driver"])
    .withMessage("receiverRole must be user or driver"),
];

module.exports = {
  sendNotificationValidation,
  listNotificationsValidation,
};
