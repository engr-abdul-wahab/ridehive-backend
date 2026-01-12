const DriverService = require("../../service/admin/admin-driver-service");
const catchAsync = require("../../utils/catchAsync");
const { handlers } = require("../../utils/handlers");

class AdminDriverController {
  constructor() {
    this.listDrivers = this.listDrivers.bind(this);
    this.getDriver = this.getDriver.bind(this);
    this.updateDriver = this.updateDriver.bind(this);
    this.approveDriver = this.approveDriver.bind(this);
    this.blockDriver = this.blockDriver.bind(this);
    this.getDriverRides = this.getDriverRides.bind(this);
  }

  listDrivers = catchAsync(async (req, res) => {
    const {
      page = 1,
      limit = 25,
      search = "",
      status = "approved",
    } = req.query;
    const result = await DriverService.listDrivers({
      page,
      limit,
      search,
      status,
    });

    handlers.logger.success({
      object_type: "admin.driver.list",
      message: "Fetched drivers list",
      data: { adminId: req.user.id },
    });

    return handlers.response.success({
      res,
      code: 200,
      message: "Drivers fetched",
      data: result,
    });
  });

  getDriver = catchAsync(async (req, res) => {
    const driverId = req.params.id;
    const driver = await DriverService.getDriver(driverId);

    handlers.logger.success({
      object_type: "admin.driver.get",
      message: "Fetched driver",
      data: { adminId: req.user.id, driverId },
    });

    return handlers.response.success({
      res,
      code: 200,
      message: "Driver fetched",
      data: driver,
    });
  });

  updateDriver = catchAsync(async (req, res) => {
    const driverId = req.params.id;
    const updates = req.body || {};
    const file = req.file || null;

    const updated = await DriverService.updateDriver(driverId, updates, file);

    handlers.logger.success({
      object_type: "admin.driver.update",
      message: "Updated driver",
      data: { adminId: req.user.id, driverId },
    });

    return handlers.response.success({
      res,
      code: 200,
      message: "Driver updated",
      data: updated,
    });
  });

  approveDriver = catchAsync(async (req, res) => {
    const driverId = req.params.id;
    const { action, reason } = req.body;
    await DriverService.approveDriver(driverId, action, reason, req.user.id);

    handlers.logger.success({
      object_type: "admin.driver.approve",
      message: `${action} driver`,
      data: { adminId: req.user.id, driverId, action },
    });

    return handlers.response.success({
      res,
      code: 200,
      message: `Driver ${action}d successfully`,
    });
  });

  blockDriver = catchAsync(async (req, res) => {
    const driverId = req.params.id;
    const { action, reason } = req.body;
    await DriverService.blockDriver(driverId, action, reason, req.user.id);

    handlers.logger.success({
      object_type: "admin.driver.block",
      message: `${action} driver`,
      data: { adminId: req.user.id, driverId, action },
    });

    return handlers.response.success({
      res,
      code: 200,
      message: `Driver ${action} successful`,
    });
  });

  getDriverRides = catchAsync(async (req, res) => {
    const driverId = req.params.id;
    const { page = 1, limit = 25 } = req.query;
    const reports = await DriverService.getDriverRidesAndMetrics(driverId, {
      page,
      limit,
    });

    handlers.logger.success({
      object_type: "admin.driver.rides",
      message: "Fetched driver rides & metrics",
      data: { adminId: req.user.id, driverId },
    });

    return handlers.response.success({
      res,
      code: 200,
      message: "Driver rides & metrics fetched",
      data: reports,
    });
  });
}

module.exports = new AdminDriverController();
