const RideConfigService = require("../../service/admin/admin-ride-config-service");
const catchAsync = require("../../utils/catchAsync");
const { handlers } = require("../../utils/handlers");

class AdminRideConfigController {
  constructor() {
    this.getConfig = this.getConfig.bind(this);
    this.updateConfig = this.updateConfig.bind(this);
  }

  // GET /admin/ride-config
  getConfig = catchAsync(async (req, res) => {
    const cfg = await RideConfigService.getConfig();

    handlers.logger.success({
      object_type: "admin.ride_config.get",
      message: "Fetched singleton ride config",
      data: { adminId: req.user.id },
    });

    return handlers.response.success({
      res,
      code: 200,
      message: "Ride config fetched successfully",
      data: cfg,
    });
  });

  // PATCH /admin/ride-config
  updateConfig = catchAsync(async (req, res) => {
    const updates = req.body || {};
    const updated = await RideConfigService.updateConfig(updates, req.user.id);

    handlers.logger.success({
      object_type: "admin.ride_config.update",
      message: "Updated singleton ride config",
      data: { adminId: req.user.id },
    });

    return handlers.response.success({
      res,
      code: 200,
      message: "Ride config updated successfully",
      data: updated,
    });
  });
}

module.exports = new AdminRideConfigController();
