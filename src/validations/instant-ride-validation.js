const { body } = require("express-validator");

exports.createInstantRideValidation = [
  body("rideType")
    .notEmpty()
    .withMessage("rideType is required")
    .isIn(["instant", "schedule"])
    .withMessage("rideType must be one of instant or schedule"),
  body("vehicleType")
    .notEmpty()
    .withMessage("vehicleType is required")
    .isIn(["car_standard", "car_deluxe", "motorcycle_standard"])
    .withMessage(
      "vehicleType must be one of car_standard, car_deluxe, or motorcycle_standard"
    ),

  body("from.coordinates")
    .exists()
    .withMessage("from.coordinates is required")
    .isArray({ min: 2, max: 2 })
    .withMessage("from.coordinates must be an array with [longitude, latitude]")
    .custom((arr) => arr.every((c) => !isNaN(Number(c))))
    .withMessage("from.coordinates must contain numeric values")
    .bail()
    .customSanitizer((arr) => arr.map(Number)),

  body("to.coordinates")
    .exists()
    .withMessage("to.coordinates is required")
    .isArray({ min: 2, max: 2 })
    .withMessage("to.coordinates must be an array with [longitude, latitude]")
    .custom((arr) => arr.every((c) => !isNaN(Number(c))))
    .withMessage("to.coordinates must contain numeric values")
    .bail()
    .customSanitizer((arr) => arr.map(Number)),

  body("from.address")
    .optional()
    .isString()
    .withMessage("from.address must be a string"),
  body("to.address")
    .optional()
    .isString()
    .withMessage("to.address must be a string"),
];
