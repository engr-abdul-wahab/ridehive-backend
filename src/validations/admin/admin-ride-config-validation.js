const { body } = require("express-validator");

const getRideConfigValidation = [
  // no input for GET, kept for consistency
];

const updateRideConfigValidation = [
  body("carStandardRate").optional().isFloat({ min: 0 }).withMessage("Car standard rate must be a number >= 0").toFloat(),
  body("carDeluxeRate").optional().isFloat({ min: 0 }).withMessage("Car deluxe rate must be a number >= 0").toFloat(),
  body("motorcycleStandardRate").optional().isFloat({ min: 0 }).withMessage("Motorcycle standard rate must be a number >= 0").toFloat(),
  body("courierFoodRate").optional().isFloat({ min: 0 }).withMessage("Courier food rate must be a number >= 0").toFloat(),
  body("addStopRate").optional().isFloat({ min: 0 }).withMessage("Add stop rate must be a number >= 0").toFloat(),
  body("defaultRadiusMiles").optional().isFloat({ min: 0 }).withMessage("Default radius must be a number >= 0").toFloat(),
  body("maxNotifyDrivers").optional().isInt({ min: 0 }).withMessage("Max notify drivers must be an integer >= 0").toInt(),
];

module.exports = {
  getRideConfigValidation,
  updateRideConfigValidation,
};
