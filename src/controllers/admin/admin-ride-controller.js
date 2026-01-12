const RideService = require("../../service/admin/admin-ride-service");
const catchAsync = require("../../utils/catchAsync");
const { handlers } = require("../../utils/handlers");

class AdminRideController {
  constructor() {
    this.listRides = this.listRides.bind(this);
    this.getRide = this.getRide.bind(this);
    this.assignDriver = this.assignDriver.bind(this);
    this.updateStatus = this.updateStatus.bind(this);
  }

  listRides = catchAsync(async (req, res) => {
    const {
      page = 1,
      limit = 25,
      status,
      search = "",
      userId,
      driverId,
      dateFrom,
      dateTo,
      rideType,
    } = req.query;

    const result = await RideService.listRides({
      page,
      limit,
      status,
      search,
      userId,
      driverId,
      dateFrom,
      dateTo,
      rideType,
    });

    handlers.logger.success({
      object_type: "admin.ride.list",
      message: "Fetched rides list",
      data: { adminId: req.user.id },
    });

    return handlers.response.success({
      res,
      code: 200,
      message: "Rides fetched",
      data: result,
    });
  });

  getRide = catchAsync(async (req, res) => {
    const rideId = req.params.id;
    const ride = await RideService.getRide(rideId);

    handlers.logger.success({
      object_type: "admin.ride.get",
      message: "Fetched ride",
      data: { adminId: req.user.id, rideId },
    });

    return handlers.response.success({
      res,
      code: 200,
      message: "Ride fetched",
      data: ride,
    });
  });

  assignDriver = catchAsync(async (req, res) => {
    const rideId = req.params.id;
    const { driverId } = req.body;

    await RideService.assignDriver(rideId, driverId, req.user.id);

    handlers.logger.success({
      object_type: "admin.ride.assign",
      message: "Driver assigned to ride",
      data: { adminId: req.user.id, rideId, driverId },
    });

    return handlers.response.success({
      res,
      code: 200,
      message: "Driver assigned successfully",
    });
  });

  updateStatus = catchAsync(async (req, res) => {
    const rideId = req.params.id;
    const { status, reason } = req.body;

    await RideService.updateStatus(rideId, status, reason, req.user.id);

    handlers.logger.success({
      object_type: "admin.ride.status",
      message: `Ride status updated to ${status}`,
      data: { adminId: req.user.id, rideId, status },
    });

    return handlers.response.success({
      res,
      code: 200,
      message: `Ride status updated to ${status}`,
    });
  });
}

module.exports = new AdminRideController();
