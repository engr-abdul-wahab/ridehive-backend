// src/routes/vehicle.routes.js
const express = require("express");
const router = express.Router();
const vehicleController = require("../controllers/vehicle-controller");
const validate = require("../middlewares/validate"); // your middleware that uses validationResult
const {
  createVehicleValidation,
} = require("../validations/vehicle-validation");
const upload = require("../middlewares/multer-middleware"); // your multer-s3 export (named upload)
const auth = require("../middlewares/auth-middleware"); // your JWT auth middleware
const roleMiddleware = require("../middlewares/role-middleware");

const fileFields = [
  { name: "licensePlate", maxCount: 1 },
  { name: "vehiclePicture", maxCount: 1 },
  { name: "driverLicense", maxCount: 1 },
  { name: "vehicleRegistration", maxCount: 1 },
  { name: "taxiOperatorLicense", maxCount: 1 },
  { name: "insuranceCard", maxCount: 1 },
];

// protect route, then accept files
router.post(
  "/create-vehicle-details",
  auth,
  roleMiddleware(["driver"]),
  upload.fields(fileFields),
  createVehicleValidation,
  validate,
  vehicleController.createVehicle
);

// PATCH for partial updates
router.patch(
  "/update-vehicle-details",
  auth,
  roleMiddleware("driver"),
  upload.fields(fileFields),
  vehicleController.updateVehicle
);

// get current driver's vehicle
router.get(
  "/get-vehicle-details",
  auth,
  roleMiddleware("driver"),
  vehicleController.getMyVehicle
);

module.exports = router;
