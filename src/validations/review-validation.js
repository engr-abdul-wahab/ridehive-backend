const { body, query } = require("express-validator");

const addReviewValidation = [
  body("driverId")
    .notEmpty()
    .withMessage("driverId is required")
    .isMongoId()
    .withMessage("driverId must be a valid Mongo ID"),
  body("rideId")
    .notEmpty()
    .withMessage("rideId is required")
    .isMongoId()
    .withMessage("rideId must be a valid Mongo ID"),
  body("paymentId")
    .optional()
    .isString()
    .withMessage("paymentId must be a string"),
  body("rating")
    .notEmpty()
    .withMessage("rating is required")
    .isInt({ min: 1, max: 5 })
    .withMessage("rating must be an integer between 1 and 5"),
  body("review")
    .optional()
    .isString()
    .isLength({ max: 2000 })
    .withMessage("review must be a string of max 2000 chars"),
  body("isAnonymous")
    .optional()
    .isBoolean()
    .withMessage("isAnonymous must be boolean"),
];

const driverReviewValidation = [
  query("driverId").notEmpty().withMessage("driverId is required"),
  query("page").optional().isInt({ min: 1 }).toInt(),
  query("limit").optional().isInt({ min: 1 }).toInt(),
];

module.exports = {
  addReviewValidation,
  driverReviewValidation,
};
