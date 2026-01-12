const express = require("express");
const router = express.Router();

const AdminRideConfigController = require("../../controllers/admin/admin-ride-config-controller");
const authMiddleware = require("../../middlewares/auth-middleware");
const adminMiddleware = require("../../middlewares/admin-middleware");
const validate = require("../../middlewares/validate");
const upload = require("../../middlewares/multer-middleware");

const {
  getRideConfigValidation,
  updateRideConfigValidation,
} = require("../../validations/admin/admin-ride-config-validation");

router.use(authMiddleware, adminMiddleware);

/**
 * GET singleton ride config
 */
router.get(
  "/",
  getRideConfigValidation,
  validate,
  AdminRideConfigController.getConfig
);

/**
 * PATCH singleton ride config
 */
router.patch(
  "/update",
  upload.none(),
  updateRideConfigValidation,
  validate,
  AdminRideConfigController.updateConfig
);

module.exports = router;
