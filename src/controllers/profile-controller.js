// src/controllers/profile-controller.js
const profileService = require("../service/profile-service");
const { handlers } = require("../utils/handlers");
const catchAsync = require("../utils/catchAsync");

class ProfileController {
  createProfile = catchAsync(async (req, res) => {
    const clientIp = req.ip || req.headers["x-forwarded-for"]?.split(",")[0];
    // expecting req.user.id from auth middleware; fallback to body.userId (not recommended)
    const result = await profileService.createProfile({
      body: req.body,
      file: req.file,
      user: req.user, // { id, email, role, ... } - auth middleware
      ip: clientIp,
      userAgent: req.get("User-Agent"),
    });

    handlers.logger.success({
      object_type: "profile.create",
      message: result.message,
      data: result.data || null,
    });

    return handlers.response.success({
      res,
      code: 200,
      message: result.message || "Profile created/updated",
      data: result.data || null,
    });
  });

  updateProfile = catchAsync(async (req, res) => {
    const clientIp = req.ip || req.headers["x-forwarded-for"]?.split(",")[0];

    const result = await profileService.updateProfile({
      body: req.body,
      file: req.file,
      user: req.user,
      ip: clientIp,
      userAgent: req.get("User-Agent"),
    });

    // logging
    handlers.logger.success({
      object_type: "profile.update",
      message: result.message,
      data: result.data || null,
    });

    return handlers.response.success({
      res,
      code: 200,
      message: result.message || "Profile updated",
      data: result.data || null,
    });
  });
}

module.exports = new ProfileController();
