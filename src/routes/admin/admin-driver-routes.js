const express = require("express");
const router = express.Router();

const AdminDriverController = require("../../controllers/admin/admin-driver-controller");
const authMiddleware = require("../../middlewares/auth-middleware");
const adminMiddleware = require("../../middlewares/admin-middleware");
const validate = require("../../middlewares/validate");
const upload = require("../../middlewares/multer-middleware");

const {
  listDriversValidation,
  getDriverValidation,
  updateDriverValidation,
  approveDriverValidation,
  driverRidesValidation,
  blockDriverValidation,
} = require("../../validations/admin/admin-driver-validation");

// Protect all admin driver routes
router.use(authMiddleware, adminMiddleware);

router.get(
  "/",
  listDriversValidation,
  validate,
  AdminDriverController.listDrivers
);
router.get(
  "/:id",
  getDriverValidation,
  validate,
  AdminDriverController.getDriver
);
router.patch(
  "/:id",
  upload.single("profileImage"),
  updateDriverValidation,
  validate,
  AdminDriverController.updateDriver
);
router.post(
  "/:id/approve",
  upload.none(),
  approveDriverValidation,
  validate,
  AdminDriverController.approveDriver
);
router.post(
  "/:id/block",
  upload.none(),
  blockDriverValidation,
  validate,
  AdminDriverController.blockDriver
);
router.get(
  "/:id/rides",
  driverRidesValidation,
  validate,
  AdminDriverController.getDriverRides
);

module.exports = router;
