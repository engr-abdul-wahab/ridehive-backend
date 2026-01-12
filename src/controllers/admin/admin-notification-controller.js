const NotificationService = require("../../service/admin/admin-notification-service");
const catchAsync = require("../../utils/catchAsync");
const { handlers } = require("../../utils/handlers");

class AdminNotificationController {
  constructor() {
    this.sendNotification = this.sendNotification.bind(this);
    this.listNotifications = this.listNotifications.bind(this);
  }

  /**
   * Send notification to all users, all drivers, or both.
   */
  sendNotification = catchAsync(async (req, res) => {
    const { title, message, targetRoles = [], data = {} } = req.body;

    // Send notification
    const result = await NotificationService.sendNotificationToMultiple({
      title,
      message,
      targetRoles,
      data,
      senderId: req.user.id,
    });

    return handlers.response.success({
      res,
      code: 200,
      message: `Notifications sent to ${result.count} users`,
      data: result,
    });
  });

  /**
   * List notifications sent by admin
   */
  listNotifications = catchAsync(async (req, res) => {
    const { page = 1, limit = 25, receiverRole } = req.query;
    const adminId = req.user.id;

    const result = await NotificationService.listNotifications(adminId, {
      page,
      limit,
      receiverRole,
    });

    handlers.logger.success({
      object_type: "admin.notification.list",
      message: "Fetched notifications list",
      data: { adminId, receiverRole, page, limit },
    });

    return handlers.response.success({
      res,
      code: 200,
      message: "Notifications fetched",
      data: result,
    });
  });
}

module.exports = new AdminNotificationController();
