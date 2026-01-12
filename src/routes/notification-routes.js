const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth-middleware"); // your auth middleware
const roleMiddleware = require("../middlewares/role-middleware");
const notificationController = require("../controllers/notification-controller");
const upload = require("../middlewares/multer-middleware");
const { body } = require("express-validator");

// router.post(
//   "/send-notification",
//   auth,
//   roleMiddleware(["user", "driver"]),
//   upload.none(),
//   notificationController.sendNotification
// );

// POST /api/notifications/send
// router.post(
//   "/send-notification",
//   [
//     body("receiverId").notEmpty().withMessage("receiverId is required"),
//     body("title").notEmpty().withMessage("title is required"),
//     body("message").notEmpty().withMessage("message is required"),
//   ],
//   upload.none(),
//   notificationController.sendNotification
// );

// GET all notifications for logged-in user (no pagination)
router.get(
  "/get-notifications",
  auth,
  roleMiddleware(["user", "driver"]),
  notificationController.getNotifications
);

// POST mark notification read
router.post(
  "/mark-read-notification",
  auth,
  roleMiddleware(["user", "driver"]),
  upload.none(),
  notificationController.markRead
);

module.exports = router;
