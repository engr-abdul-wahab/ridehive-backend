const User = require("../../models/User");
const Notification = require("../../models/Notification");
const sendNotification = require("../../utils/sendNotification");
const { Types } = require("mongoose");

class AdminNotificationService {
  constructor() {}

  /**
   * Send notification to multiple users by role
   */
  async sendNotificationToMultiple({
    title,
    message,
    targetRoles = [],
    data = {},
    senderId,
  }) {
    // Normalize targetRoles to array
    if (!Array.isArray(targetRoles)) {
      if (typeof targetRoles === "string") {
        targetRoles = targetRoles.split(",").map((r) => r.trim());
      } else {
        targetRoles = [];
      }
    }

    if (!targetRoles.length) {
      targetRoles = ["user", "driver"]; // default: all
    }

    // Only allowed roles
    const allowedRoles = ["user", "driver"];
    const roles = targetRoles.filter((r) => allowedRoles.includes(r));
    if (!roles.length) throw new Error("No valid roles provided");

    // Parse data if string
    let parsedData = {};
    if (typeof data === "string") {
      try {
        parsedData = JSON.parse(data);
      } catch {
        parsedData = {};
      }
    } else if (typeof data === "object") {
      parsedData = data;
    }

    // Fetch all active users/drivers
    const users = await User.find({
      role: { $in: roles },
      isActive: true,
    }).lean();

    // Send notification to each
    for (const u of users) {
      await sendNotification(u._id, {
        title,
        body: message,
        senderId,
        data: parsedData,
      });
    }

    return { count: users.length };
  }

  /**
   * List notifications sent by admin
   */
  async listNotifications(
    adminId,
    { page = 1, limit = 25, receiverRole } = {}
  ) {
    const skip = (Number(page) - 1) * Number(limit);

    // Build query
    const query = { senderId: new Types.ObjectId(adminId) }; // <-- use 'new'

    if (receiverRole && ["user", "driver"].includes(receiverRole)) {
      const users = await User.find({ role: receiverRole })
        .select("_id")
        .lean();
      const ids = users.map((u) => u._id);
      query.receiverId = { $in: ids };
    }

    const [total, items] = await Promise.all([
      Notification.countDocuments(query),
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("receiverId", "fullName email role")
        .lean(),
    ]);

    const pages = Math.max(1, Math.ceil(total / Number(limit) || 1));

    return { meta: { page, limit, total, pages }, items };
  }
}

module.exports = new AdminNotificationService();
