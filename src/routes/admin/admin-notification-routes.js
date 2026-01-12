const express = require("express");
const router = express.Router();

const AdminNotificationController = require("../../controllers/admin/admin-notification-controller");
const authMiddleware = require("../../middlewares/auth-middleware");
const adminMiddleware = require("../../middlewares/admin-middleware");
const validate = require("../../middlewares/validate");
const upload = require("../../middlewares/multer-middleware");

const {
  sendNotificationValidation,
  listNotificationsValidation,
} = require("../../validations/admin/admin-notification-validation");

// Protect all admin notification routes
router.use(authMiddleware, adminMiddleware);

// POST /admin/notifications/send
router.post(
  "/send",
  upload.none(),
  sendNotificationValidation,
  validate,
  AdminNotificationController.sendNotification
);

// GET /admin/notifications
router.get(
  "/",
  listNotificationsValidation,
  validate,
  AdminNotificationController.listNotifications
);

module.exports = router;
