const catchAsync = require("../../utils/catchAsync");
const VehicleService = require("../../service/admin/admin-vehicle-service");
const { handlers } = require("../../utils/handlers");

class AdminVehicleController {
  // List vehicles
  listVehicles = catchAsync(async (req, res) => {
    const { page, limit, search } = req.query;
    const result = await VehicleService.listVehicles({
      page: Number(page) || 1,
      limit: Number(limit) || 25,
      search: search || "",
    });

    handlers.logger.success({
      object_type: "admin.vehicle.list",
      message: "Fetched vehicle list",
      data: { adminId: req.user.id },
    });

    return handlers.response.success({
      res,
      code: 200,
      message: "Vehicles fetched successfully",
      data: result, // full URLs only
    });
  });

  // View single vehicle
  getVehicle = catchAsync(async (req, res) => {
    const vehicleId = req.params.id;
    const vehicle = await VehicleService.getVehicle(vehicleId);

    handlers.logger.success({
      object_type: "admin.vehicle.view",
      message: "Fetched vehicle details",
      data: { adminId: req.user.id, vehicleId },
    });

    return handlers.response.success({
      res,
      code: 200,
      message: "Vehicle details fetched",
      data: vehicle, // full URLs only
    });
  });

  // Update vehicle info
  updateVehicle = catchAsync(async (req, res) => {
    const vehicleId = req.params.id;
    const updates = req.body || {};
    const files = req.files || {};

    const updated = await VehicleService.updateVehicle(
      vehicleId,
      updates,
      files
    );

    handlers.logger.success({
      object_type: "admin.vehicle.update",
      message: "Vehicle updated",
      data: { adminId: req.user.id, vehicleId },
    });

    return handlers.response.success({
      res,
      code: 200,
      message: "Vehicle updated successfully",
      data: updated,
    });
  });
}

module.exports = new AdminVehicleController();
