// src/controllers/notification-controller.js
const mongoose = require("mongoose");
const notificationService = require("../service/notification-service");

function isValidObjectId(id) {
  return !!id && mongoose.Types.ObjectId.isValid(String(id));
}

class NotificationController {
  // POST /api/notifications/send-notification
  // sendNotification = async (req, res) => {
  //   try {
  //     // Accept JSON body or form-data
  //     const body = req.body || {};
  //     const receiverId = body.receiverId || body.receiver_id;
  //     const title = body.title;
  //     const message = body.message || body.msg;
  //     const deviceToken = body.deviceToken || body.device_token;
  //     const rawData = body.data || null;

  //     // Ensure senderId exists (from auth or fallback to body)
  //     const senderId = req.user?._id || body.senderId || body.sender_id;
  //     if (!senderId) {
  //       return res.status(400).json({
  //         status: 0,
  //         message: "senderId is required",
  //       });
  //     }

  //     // Validate required fields
  //     if (!receiverId || !title || !message) {
  //       return res.status(400).json({
  //         status: 0,
  //         message: "Missing required fields: receiverId, title, or message",
  //       });
  //     }

  //     // Optional: validate ObjectId shape (helps catch frontend mistakes early)
  //     if (!isValidObjectId(senderId) || !isValidObjectId(receiverId)) {
  //       return res.status(400).json({
  //         status: 0,
  //         message: "senderId or receiverId is not a valid ObjectId",
  //       });
  //     }

  //     // Normalize data: ensure object with string values or undefined
  //     let data;
  //     if (rawData && typeof rawData === "object" && !Array.isArray(rawData)) {
  //       data = Object.fromEntries(
  //         Object.entries(rawData).map(([k, v]) => [
  //           String(k),
  //           typeof v === "string" ? v : JSON.stringify(v),
  //         ])
  //       );
  //     } else {
  //       data = undefined;
  //     }

  //     // Call the service to send notification
  //     const notification = await notificationService.sendNotification({
  //       senderId,
  //       receiverId,
  //       title,
  //       message,
  //       deviceToken,
  //       data,
  //     });

  //     return res.status(200).json({
  //       status: 1,
  //       message: "Notification sent successfully",
  //       data: notification,
  //     });
  //   } catch (err) {
  //     console.error("NotificationController error:", err);
  //     return res.status(500).json({
  //       status: 0,
  //       message: err.message || "Internal server error",
  //       data: null,
  //     });
  //   }
  // };

  // async function sendNotification(req, res, next) {
  // async sendNotification(req, res) {
  //   try {
  //     const senderId = req.body.senderId || (req.user && req.user.id) || null;
  //     const { receiverId, title, message, data } = req.body;

  //     if (!receiverId || !title || !message) {
  //       return res.status(400).json({
  //         status: 0,
  //         message: "receiverId, title and message are required",
  //       });
  //     }

  //     const result = await notificationService.sendNotification({
  //       senderId,
  //       receiverId,
  //       title,
  //       message,
  //       data,
  //     });

  //     return res.json({
  //       status: 1,
  //       message: "Notification processed",
  //       data: {
  //         notification: result.notification,
  //         sentViaPush: result.sentViaPush,
  //       },
  //     });
  //   } catch (err) {
  //     const status = err.status || 500;
  //     return res.status(status).json({
  //       status: 0,
  //       message: err.message || "Something went wrong",
  //     });
  //   }
  // }
  // GET /api/notifications
  getNotifications = async (req, res) => {
    try {
      const userId = req.user?._id || req.user?.id;
      if (!userId) {
        return res.status(401).json({ status: 0, message: "Unauthorized" });
      }

      const notifications = await notificationService.listAllForUser({
        userId,
      });

      return res.status(200).json({
        status: 1,
        message: "Notifications fetched",
        data: notifications,
      });
    } catch (err) {
      console.error("getNotifications error:", err);
      return res.status(500).json({
        status: 0,
        message: err.message || "Internal server error",
        data: null,
      });
    }
  };

  // POST /api/notifications/mark-read
  markRead = async (req, res) => {
    try {
      const notificationId =
        (req.body && (req.body.notificationId || req.body.notification_id)) ||
        (req.fields &&
          (req.fields.notificationId || req.fields.notification_id)) ||
        req.query?.notificationId ||
        req.query?.notification_id;

      const userId = req.user?._id || req.user?.id;
      if (!userId) {
        return res.status(401).json({ status: 0, message: "Unauthorized" });
      }

      if (!notificationId) {
        return res
          .status(400)
          .json({ status: 0, message: "notificationId is required" });
      }

      if (!isValidObjectId(notificationId)) {
        return res.status(400).json({
          status: 0,
          message: "notificationId is not a valid ObjectId",
        });
      }

      const updated = await notificationService.markAsRead(
        notificationId,
        userId
      );

      return res.status(200).json({
        status: 1,
        message: "Notification marked as read",
        data: updated,
      });
    } catch (err) {
      console.error("markRead error:", err);
      const code = err.statusCode || 500;
      return res.status(code).json({
        status: 0,
        message: err.message || "Internal server error",
        data: null,
      });
    }
  };
}

module.exports = new NotificationController();
