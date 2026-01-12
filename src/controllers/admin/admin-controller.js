// src/controllers/admin-controller.js
const AdminService = require("../../service/admin/admin-service");
const catchAsync = require("../../utils/catchAsync");
const { handlers } = require("../../utils/handlers");

class AdminController {
  constructor() {
    this.login = this.login.bind(this);
    this.logout = this.logout.bind(this);
    this.updateProfile = this.updateProfile.bind(this);
    this.getProfile = this.getProfile.bind(this);
    this.changePassword = this.changePassword.bind(this);
  }

  login = catchAsync(async (req, res) => {
    const payload = req.body;
    const result = await AdminService.login(payload);
    handlers.logger.success({
      object_type: "admin.login",
      message: "Admin logged in",
      data: { email: payload.email },
    });
    return handlers.response.success({
      res,
      code: 200,
      message: "Login successful",
      data: result,
    });
  });

  logout = catchAsync(async (req, res) => {
    const adminId = req.user && req.user.id;
    await AdminService.logout(adminId);
    handlers.logger.success({
      object_type: "admin.logout",
      message: "Admin logged out",
      data: { adminId },
    });
    return handlers.response.success({
      res,
      code: 200,
      message: "Logout successful",
      data: null,
    });
  });

  // GET profile
  getProfile = catchAsync(async (req, res) => {
    const adminId = req.user && (req.user.id || req.user._id);
    const profile = await AdminService.getProfile(adminId);

    return handlers.response.success({
      res,
      code: 200,
      message: "Profile fetched",
      data: profile,
    });
  });

  // PUT update profile
  updateProfile = catchAsync(async (req, res) => {
    const adminId = req.user && (req.user.id || req.user._id);
    // pass both body updates and optional uploaded file (multer -> req.file)
    const updated = await AdminService.updateProfile(
      adminId,
      req.body || {},
      req.file || null
    );

    handlers.logger.success({
      object_type: "admin.updateProfile",
      message: "Admin profile updated",
      data: { adminId },
    });

    return handlers.response.success({
      res,
      code: 200,
      message: "Profile updated",
      data: updated,
    });
  });

  changePassword = catchAsync(async (req, res) => {
    const adminId = req.user && req.user.id;
    const { oldPassword, newPassword } = req.body;

    await AdminService.changePassword(adminId, oldPassword, newPassword);

    handlers.logger.success({
      object_type: "admin.changePassword",
      message: "Admin password changed",
      data: { adminId },
    });

    return handlers.response.success({
      res,
      code: 200,
      message: "Password changed successfully",
    });
  });
}

module.exports = new AdminController();
