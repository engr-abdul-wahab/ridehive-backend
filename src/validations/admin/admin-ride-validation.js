const { query, param, body } = require("express-validator");
const { isValidObjectId } = require("mongoose");

const listRidesValidation = [
  query("page").optional().isInt({ min: 1 }).toInt(),
  query("limit").optional().isInt({ min: 1, max: 200 }).toInt(),
  query("status")
    .optional()
    .isIn(["created", "pending", "accepted", "ongoing", "completed", "cancelled"]),
  // rideType filter
  query("rideType")
    .optional()
    .isIn(["instant", "schedule", "courier-food", "courier-package"])
    .withMessage("rideType must be one of instant|schedule|courier-food|courier-package"),
  query("search").optional().isString().trim(),
  query("userId")
    .optional()
    .custom((val) => {
      if (!isValidObjectId(val)) throw new Error("Invalid userId");
      return true;
    }),
  query("driverId")
    .optional()
    .custom((val) => {
      if (!isValidObjectId(val)) throw new Error("Invalid driverId");
      return true;
    }),
  query("dateFrom").optional().isISO8601().toDate(),
  query("dateTo").optional().isISO8601().toDate(),
];

const getRideValidation = [param("id").isMongoId().withMessage("Invalid ride id")];

const assignDriverValidation = [
  param("id").isMongoId().withMessage("Invalid ride id"),
  body("driverId").exists().withMessage("driverId is required").bail()
    .custom((val) => {
      if (!isValidObjectId(val)) throw new Error("Invalid driverId");
      return true;
    }),
];

const updateRideStatusValidation = [
  param("id").isMongoId().withMessage("Invalid ride id"),
  // Admin may only cancel rides via this endpoint
  body("status")
    .exists()
    .withMessage("status is required")
    .isIn(["cancelled"])
    .withMessage("Admins can only set status to 'cancelled'"),
  body("reason").optional().isString(),
];

module.exports = {
  listRidesValidation,
  getRideValidation,
  assignDriverValidation,
  updateRideStatusValidation,
};
