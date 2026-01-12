const UserService = require("../../service/admin/admin-user-service");
const catchAsync = require("../../utils/catchAsync");
const { handlers } = require("../../utils/handlers");

class AdminUserController {
  constructor() {
    this.listUsers = this.listUsers.bind(this);
    this.getUser = this.getUser.bind(this);
    this.updateUser = this.updateUser.bind(this);
    this.blockUser = this.blockUser.bind(this);
    this.getUserRides = this.getUserRides.bind(this);
  }

  listUsers = catchAsync(async (req, res) => {
    const { page = 1, limit = 25, search = "", status = "active" } = req.query;
    const result = await UserService.listUsers({ page, limit, search, status });

    handlers.logger.success({
      object_type: "admin.user.list",
      message: "Fetched users list",
      data: { adminId: req.user.id },
    });

    return handlers.response.success({
      res,
      code: 200,
      message: "Users fetched",
      data: result,
    });
  });

  getUser = catchAsync(async (req, res) => {
    const userId = req.params.id;
    const user = await UserService.getUser(userId);

    handlers.logger.success({
      object_type: "admin.user.get",
      message: "Fetched user",
      data: { adminId: req.user.id, userId },
    });

    return handlers.response.success({
      res,
      code: 200,
      message: "User fetched",
      data: user,
    });
  });

  updateUser = catchAsync(async (req, res) => {
    const userId = req.params.id;
    const updates = req.body || {};
    const file = req.file || null;

    const updated = await UserService.updateUser(userId, updates, file);

    handlers.logger.success({
      object_type: "admin.user.update",
      message: "Updated user",
      data: { adminId: req.user.id, userId },
    });

    return handlers.response.success({
      res,
      code: 200,
      message: "User updated",
      data: updated,
    });
  });

  blockUser = catchAsync(async (req, res) => {
    const userId = req.params.id;
    const { action, reason } = req.body;

    await UserService.blockUser(userId, action, reason, req.user.id);

    handlers.logger.success({
      object_type: "admin.user.block",
      message: `User ${action}`,
      data: { adminId: req.user.id, userId, action },
    });

    return handlers.response.success({
      res,
      code: 200,
      message: `User ${action} successful`,
    });
  });

  getUserRides = catchAsync(async (req, res) => {
    const userId = req.params.id;
    const { page = 1, limit = 25 } = req.query;
    const rides = await UserService.getUserRides(userId, { page, limit });

    handlers.logger.success({
      object_type: "admin.user.rides",
      message: "Fetched user rides",
      data: { adminId: req.user.id, userId },
    });

    return handlers.response.success({
      res,
      code: 200,
      message: "User rides fetched",
      data: rides,
    });
  });
}

module.exports = new AdminUserController();
