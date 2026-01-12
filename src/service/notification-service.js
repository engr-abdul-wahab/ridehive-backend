// const { initFirebaseAdmin } = require("../config/firebase");
const Notification = require("../models/Notification");
const User = require("../models/User");
const { s3Utils } = require("../config/aws-s3");

// const admin = initFirebaseAdmin();

class NotificationService {
  constructor() {
    this.APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:4000";
  }

  // helper to check if key is local
  isLocalKey(key) {
    if (!key || typeof key !== "string") return false;
    return key.startsWith("uploads/");
  }

  buildProfileImage(key) {
    if (!key) return null;
    const k = String(key).trim();
    // already a full URL
    if (/^(https?:)?\/\//i.test(k)) {
      return k;
    }

    // local file
    if (this.isLocalKey(k)) {
      if (!this.APP_BASE_URL) {
        console.log("APP_BASE_URL not set");
        return k; // fallback to raw key
      }

      return `${this.APP_BASE_URL.replace(/\/$/, "")}/${k.replace(/^\/+/, "")}`;
    }

    // S3 file
    if (s3Utils && typeof s3Utils.getFileUrl === "function") {
      try {
        const url = s3Utils.getFileUrl(k);
        return url || k; // fallback to raw key if S3 util fails
      } catch (e) {
        console.error("s3Utils.getFileUrl failed", e);
        return k; // fallback to raw key
      }
    }
    // fallback: return raw key
    return k;
  }

  // /**
  //  * Send notification
  //  * @param {Object} params
  //  * @param {ObjectId} params.senderId
  //  * @param {ObjectId} params.receiverId
  //  * @param {String} params.title
  //  * @param {String} params.message
  //  * @param {String} params.deviceToken (optional)
  //  * @param {Object} params.data (optional)
  //  */
  // async sendNotification({
  //   senderId,
  //   receiverId,
  //   title,
  //   message,
  //   deviceToken = null,
  //   data = {},
  // }) {
  //   let sentViaPush = false;

  //   console.log(deviceToken);
  //   // Send FCM push notification if deviceToken exists
  //   if (deviceToken) {
  //     const fcmMessage = {
  //       token: deviceToken,
  //       notification: { title, body: message },
  //       data,
  //     };

  //     try {
  //       await admin.messaging().send(fcmMessage);
  //       sentViaPush = true;
  //       console.log(`Push notification sent to ${receiverId}`);
  //     } catch (err) {
  //       console.error("Error sending push notification:", err);
  //     }
  //   } else {
  //     console.log(
  //       `No device token for ${receiverId}, sending in-app notification only.`
  //     );
  //   }

  //   // Save notification record in MongoDB
  //   const notification = await Notification.create({
  //     senderId,
  //     receiverId,
  //     title,
  //     message,
  //     data,
  //     sentViaPush,
  //   });

  //   return notification;
  // }

// async sendNotification({ senderId, receiverId, title, message, data = {} }) {
//     // Find receiver
//     const receiver = await User.findById(receiverId).lean();
//     if (!receiver) {
//       const err = new Error('Receiver not found');
//       err.status = 404;
//       throw err;
//     }

//     let sender = null;
//     if (senderId) {
//       sender = await User.findById(senderId).lean();
//     }

//     let sentViaPush = false;

//     const shouldPush = receiver.pushNotification === true && !!receiver.deviceToken;

//     if (shouldPush) {
//       const fcmMessage = {
//         token: receiver.deviceToken,
//         notification: { title, body: message },
//         data: Object.fromEntries(Object.entries(data || {}).map(([k, v]) => [k, String(v)])),
//         android: { priority: 'high' },
//         apns: { headers: { 'apns-priority': '10' } },
//       };

//       try {
//         await admin.messaging().send(fcmMessage);
//         sentViaPush = true;
//       } catch (err) {
//         console.warn('FCM send error:', err.message || err);
//         sentViaPush = false;
//       }
//     }

//     // Save to DB
//     const notificationDoc = await Notification.create({
//       senderId: senderId || null,
//       receiverId,
//       title,
//       message,
//       data,
//       read: false,
//       sentViaPush,
//     });

//     return { notification: notificationDoc, sentViaPush };
//   }

  async listAllForUser(opts = {}) {
    const { userId } = opts;
    if (!userId) {
      const err = new Error("userId is required");
      err.statusCode = 400;
      throw err;
    }

    // Fetch notifications
    const docs = await Notification.find({ receiverId: userId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    if (!docs || docs.length === 0) return [];

    // Collect all unique senderIds
    const senderIds = [...new Set(docs.map((n) => n.senderId).filter(Boolean))];

    // Fetch sender user data in one query
    const senders =
      senderIds.length > 0
        ? await User.find({ _id: { $in: senderIds } })
            .select("fullName profileImageKey")
            .lean()
        : [];

    const sendersMap = {};
    for (const s of senders) {
      sendersMap[s._id] = {
        _id: s._id,
        fullName: s.fullName,
        profileImageUrl: this.buildProfileImage(s.profileImageKey),
      };
    }

    // Map notifications with sender info
    const formatted = docs.map((n) => ({
      ...n,
      sender: n.senderId ? sendersMap[n.senderId] || null : null,
    }));

    return formatted;
  }
  /**
   * markAsRead - mark a single notification as read (only if receiver matches)
   * @param {String} notificationId
   * @param {String|ObjectId} readerId
   * @returns updated notification document
   */
  async markAsRead(notificationId, readerId) {
    if (!notificationId) {
      const err = new Error("notificationId is required");
      err.statusCode = 400;
      throw err;
    }
    if (!readerId) {
      const err = new Error("readerId is required");
      err.statusCode = 401;
      throw err;
    }

    const n = await Notification.findOne({
      _id: notificationId,
      receiverId: readerId,
    }).exec();
    if (!n) {
      const err = new Error("Notification not found or access denied");
      err.statusCode = 404;
      throw err;
    }

    n.read = true;
    n.seenAt = new Date();
    await n.save();

    // return a lean object
    return n.toObject ? n.toObject() : JSON.parse(JSON.stringify(n));
  }
}

module.exports = new NotificationService();
