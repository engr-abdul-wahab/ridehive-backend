// src/controllers/vehicle-controller.js
const VehicleService = require("../service/vehicle-service");
const { handlers } = require("../utils/handlers");
const catchAsync = require("../utils/catchAsync");

class VehicleController {
  createVehicle = catchAsync(async (req, res) => {
    const result = await VehicleService.createVehicle({
      user: req.user,
      body: req.body,
      files: req.files || {},
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });

    handlers.logger.success({
      object_type: "vehicle.createOrUpdate",
      message: result.message,
      data: result.data,
    });
    return handlers.response.success({
      res,
      code: 200,
      message: result.message,
      data: result.data,
    });
  });

  updateVehicle = catchAsync(async (req, res) => {
    const clientIp = req.ip || req.headers["x-forwarded-for"]?.split(",")[0];

    const result = await VehicleService.updateVehicle({
      user: req.user,
      body: req.body,
      files: req.files || {},
      ip: clientIp,
      userAgent: req.get("User-Agent"),
    });

    handlers.logger?.success
      ? handlers.logger.success({
          object_type: "vehicle.update",
          message: result.message,
          data: result.data,
        })
      : console.log("vehicle.update", result.message);

    return handlers.response.success({
      res,
      code: 200,
      message: result.message || "Vehicle updated",
      data: result.data || null,
    });
  });

  getMyVehicle = catchAsync(async (req, res) => {
    const result = await VehicleService.getVehicleByDriver({ user: req.user });
    return handlers.response.success({
      res,
      code: 200,
      message: result.message,
      data: result.data,
    });
  });
}

module.exports = new VehicleController();
