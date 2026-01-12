const { query, param, body } = require("express-validator");

const listVehiclesValidation = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),
  query("limit")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Limit must be a positive integer"),
  query("search").optional().isString().withMessage("Search must be a string"),
];

const getVehicleValidation = [
  param("id").isMongoId().withMessage("Invalid vehicle id"),
];

const updateVehicleValidation = [
  param("id").isMongoId().withMessage("Invalid vehicle id"),

  body("carMakeModel")
    .optional()
    .isString()
    .withMessage("carMakeModel must be a string"),
  body("licensePlateNumber")
    .optional()
    .isString()
    .withMessage("licensePlateNumber must be a string"),
  body("color").optional().isString().withMessage("color must be a string"),
  body("specification")
    .optional()
    .isString()
    .withMessage("specification must be a string"),
  body("vehicleType")
    .optional()
    .isString()
    .withMessage("vehicleType must be a string"),
  body("rideOption")
    .optional()
    .isIn(["car_standard", "car_deluxe", "motorcycle_standard"])
    .withMessage("Invalid rideOption"),
];

module.exports = {
  listVehiclesValidation,
  getVehicleValidation,
  updateVehicleValidation,
};
