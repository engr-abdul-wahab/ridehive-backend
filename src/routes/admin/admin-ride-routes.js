const express = require("express");
const router = express.Router();

const AdminRideController = require("../../controllers/admin/admin-ride-controller");
const authMiddleware = require("../../middlewares/auth-middleware");
const adminMiddleware = require("../../middlewares/admin-middleware");
const validate = require("../../middlewares/validate");
const upload = require("../../middlewares/multer-middleware");

const {
  listRidesValidation,
  getRideValidation,
  assignDriverValidation,
  updateRideStatusValidation,
} = require("../../validations/admin/admin-ride-validation");

// Protect all admin ride routes
router.use(authMiddleware, adminMiddleware);

// list rides with filters
router.get("/", listRidesValidation, validate, AdminRideController.listRides);

// get single ride
router.get("/:id", getRideValidation, validate, AdminRideController.getRide);

// assign or reassign driver
router.post(
  "/:id/assign",
  upload.none(),
  assignDriverValidation,
  validate,
  AdminRideController.assignDriver
);

// update ride status (accepted, ongoing, completed, cancelled)
router.post(
  "/:id/status",
  upload.none(),
  updateRideStatusValidation,
  validate,
  AdminRideController.updateStatus
);

module.exports = router;
