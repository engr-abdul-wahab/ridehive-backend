const express = require("express");
const router = express.Router();

const AdminVehicleController = require("../../controllers/admin/admin-vehicle-controller");
const authMiddleware = require("../../middlewares/auth-middleware");
const adminMiddleware = require("../../middlewares/admin-middleware");
const validate = require("../../middlewares/validate");
const upload = require("../../middlewares/multer-middleware");
const {
  listVehiclesValidation,
  getVehicleValidation,
  updateVehicleValidation,
} = require("../../validations/admin/admin-vehicle-validation");

// Protect all routes
router.use(authMiddleware, adminMiddleware);

// List vehicles
router.get(
  "/",
  listVehiclesValidation,
  validate,
  AdminVehicleController.listVehicles
);

// View single vehicle
router.get(
  "/:id",
  getVehicleValidation,
  validate,
  AdminVehicleController.getVehicle
);

// Update vehicle (with files)
router.patch(
  "/:id",
  upload.fields([
    { name: "licensePlate", maxCount: 1 },
    { name: "vehiclePicture", maxCount: 1 },
    { name: "driverLicense", maxCount: 1 },
    { name: "vehicleRegistration", maxCount: 1 },
    { name: "taxiOperatorLicense", maxCount: 1 },
    { name: "insuranceCard", maxCount: 1 },
  ]),
  updateVehicleValidation,
  validate,
  AdminVehicleController.updateVehicle
);

module.exports = router;
