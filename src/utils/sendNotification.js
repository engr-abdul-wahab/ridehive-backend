// src/utils/sendNotification.js
const admin = require("../lib/firebaseAdmin"); 
const UserModel = require("../models/User");
const NotificationModel = require("../models/Notification");

const RESERVED_KEYS = [
  "from", "to", "notification", "message", "title", "body", "sound", "click_action"
];

async function sendNotification(
  receiverId,
  { title, body, senderId, data = {} }
) {
  if (!receiverId || !senderId) {
    throw new Error("receiverId and senderId are required");
  }

  try {
    const user = await UserModel.findById(receiverId);
    if (!user) return;

    let sentViaPush = false;

    // Prepare data payload
    const stringData = {};
    Object.entries({ ...data, senderId: String(senderId) }).forEach(([key, value]) => {
      const safeKey = RESERVED_KEYS.includes(key) ? `_${key}` : key;
      stringData[safeKey] = typeof value === "string" ? value : JSON.stringify(value);
    });

    if (user.pushNotification && user.deviceToken) {
      const message = {
        notification: { title, body },
        data: stringData,
        token: user.deviceToken
      };

      try {
        // Optional: add platform-specific overrides
        if (user.platform === "ios") {
          message.apns = {
            headers: { "apns-priority": "10" },
            payload: { aps: { sound: "default" } }
          };
        } else if (user.platform === "android") {
          message.android = { notification: { sound: "default" } };
        } else if (user.platform === "web") {
          message.webpush = { headers: { Urgency: "high" } };
        }

        const response = await admin.messaging().send(message);
        console.log("Push notification sent:", response);
        sentViaPush = true;

      } catch (pushErr) {
        console.error("FCM push error:", pushErr.code, pushErr.message);
        sentViaPush = false;
      }
    }

    // Save in-app notification regardless
    const inAppNotification = await NotificationModel.create({
      receiverId,
      senderId,
      title,
      message: body,
      data,
      read: false,
      sentViaPush
    });

    console.log("In-app notification saved:", inAppNotification._id);
    return inAppNotification;

  } catch (err) {
    console.error("Error sending notification:", err);
    throw err;
  }
}

module.exports = sendNotification;
