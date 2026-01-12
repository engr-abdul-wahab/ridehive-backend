const RideService = require("../service/ride-service");
const { handlers } = require("../utils/handlers");
const catchAsync = require("../utils/catchAsync");

class RideController {
  constructor() {
    this.rideService = new RideService();
  }

  createInstantRide = catchAsync(async (req, res) => {
    const userId = req.user && req.user.id;
    if (!userId) {
      return handlers.response.unauthorized({ res, message: "Missing user" });
    }

    const { vehicleType, from, to } = req.body;
    const ride = await this.rideService.createInstantRide({
      userId,
      from,
      to,
      vehicleType,
    });
    return handlers.response.success({
      res,
      message: "Ride details",
      data: ride,
    });
  });

  getOngoingRides = catchAsync(async (req, res) => {
    const userId = req.user && req.user.id;
    const role = req.user && req.user.role;

    if (!userId) {
      return handlers.response.unauthorized({
        res,
        message: "Unauthorized",
      });
    }

    const rides = await this.rideService.getOngoingRides({ userId, role });

    return handlers.response.success({
      res,
      message: "Ongoing rides fetched successfully",
      data: rides,
    });
  });

  getUserScheduleRides = catchAsync(async (req, res) => {
    const userId = req.user && req.user.id;
    if (!userId) {
      return handlers.response.unauthorized({ res, message: "Missing user" });
    }

    const rides = await this.rideService.getScheduleRidesByUser({ userId });

    return handlers.response.success({
      res,
      message: "User scheduled rides",
      data: rides,
    });
  });

  getDriverScheduleRides = catchAsync(async (req, res) => {
    const driverId = req.user && req.user.id;
    if (!driverId) {
      return handlers.response.unauthorized({ res, message: "Missing driver" });
    }

    const rides = await this.rideService.getScheduleRidesByDriver({ driverId });

    return handlers.response.success({
      res,
      message: "Driver scheduled rides",
      data: rides,
    });
  });

  getFoodDeliveryHistoryForUser = catchAsync(async (req, res) => {
    const userId = req.user && req.user.id;
    if (!userId) {
      return handlers.response.unauthorized({ res, message: "Missing user" });
    }

    const deliveries = await this.rideService.getFoodDeliveryHistoryForUser({
      userId,
    });

    return handlers.response.success({
      res,
      message: "Food delivery history for user",
      data: deliveries,
    });
  });

  getUserRideHistory = catchAsync(async (req, res) => {
    const userId = req.user && req.user.id;
    if (!userId) {
      return handlers.response.unauthorized({ res, message: "Missing user" });
    }

    const rides = await this.rideService.getUserRideHistory({ userId });

    return handlers.response.success({
      res,
      message: "User ride history",
      data: rides,
    });
  });

  getDriverRideHistory = catchAsync(async (req, res) => {
    const driverId = req.user && req.user.id;
    if (!driverId) {
      return handlers.response.unauthorized({ res, message: "Missing driver" });
    }

    const data = await this.rideService.getDriverRideHistory({ driverId });

    return handlers.response.success({
      res,
      message: "Driver ride history",
      data,
    });
  });

  getRecentPlaces = catchAsync(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
      return handlers.response.unauthorized({ res, message: "Missing user" });
    }

    const recentPlaces = await this.rideService.getRecentPlaces({ userId });

    return handlers.response.success({
      res,
      message: "Recent places fetched successfully",
      data: recentPlaces,
    });
  });
}

module.exports = RideController;
