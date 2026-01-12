const RideRequest = require("../../models/RideRequest");
const User = require("../../models/User");
const { isValidObjectId, Types } = require("mongoose");
const { buildProfileImageUrl } = require("../../utils/profile-image");

class AdminRideService {
  constructor() {}

  /**
   * List rides with pagination and filters:
   * - status: one of allowed statuses or omitted
   * - search: will search in user fullName, driver fullName, or ride id
   * - userId, driverId: filter by ObjectId
   * - dateFrom, dateTo: ISO date strings (inclusive)
   */
  async listRides({
    page = 1,
    limit = 25,
    status,
    search = "",
    userId,
    driverId,
    dateFrom,
    dateTo,
    rideType,
  } = {}) {
    const q = {};

    if (status && typeof status === "string") {
      q.status = status;
    }

    if (rideType && typeof rideType === "string") {
      q.rideType = rideType;
    }

    if (userId) {
      if (!isValidObjectId(userId)) {
        const e = new Error("Invalid user id");
        e.statusCode = 400;
        throw e;
      }
      q.userId = new Types.ObjectId(userId);
    }

    if (driverId) {
      if (!isValidObjectId(driverId)) {
        const e = new Error("Invalid driver id");
        e.statusCode = 400;
        throw e;
      }
      q.driverId = new Types.ObjectId(driverId);
    }

    if (dateFrom || dateTo) {
      q.createdAt = {};
      if (dateFrom) {
        const from = new Date(dateFrom);
        if (isNaN(from)) {
          const e = new Error("Invalid dateFrom");
          e.statusCode = 400;
          throw e;
        }
        q.createdAt.$gte = from;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        if (isNaN(to)) {
          const e = new Error("Invalid dateTo");
          e.statusCode = 400;
          throw e;
        }
        q.createdAt.$lte = to;
      }
    }

    const skip = (Number(page) - 1) * Number(limit);

    // base pipeline
    const aggregatePipeline = [{ $match: q }];

    // search by ride id OR user/driver fullName/email/phone OR from/to address
    if (search && String(search).trim().length) {
      const s = String(search).trim();

      if (isValidObjectId(s)) {
        // direct _id match
        aggregatePipeline.push({
          $match: {
            $or: [{ _id: new Types.ObjectId(s) }],
          },
        });
      } else {
        // regex for name/email/phone/address
        const safe = s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
        const regex = new RegExp(safe, "i");

        aggregatePipeline.push(
          // lookup user
          {
            $lookup: {
              from: "users",
              localField: "userId",
              foreignField: "_id",
              as: "user",
            },
          },
          { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
          // lookup driver
          {
            $lookup: {
              from: "users",
              localField: "driverId",
              foreignField: "_id",
              as: "driver",
            },
          },
          { $unwind: { path: "$driver", preserveNullAndEmptyArrays: true } },
          {
            $match: {
              $or: [
                { "user.fullName": { $regex: regex } },
                { "user.email": { $regex: regex } },
                { "user.phone": { $regex: regex } },
                { "driver.fullName": { $regex: regex } },
                { "driver.email": { $regex: regex } },
                { "driver.phone": { $regex: regex } },
                { "from.address": { $regex: regex } },
                { "to.address": { $regex: regex } },
              ],
            },
          }
        );
      }
    }

    // Count total
    const countPipeline = [...aggregatePipeline, { $count: "total" }];
    const [countResult] = await RideRequest.aggregate(countPipeline).exec();
    const total = (countResult && countResult.total) || 0;

    // Final pipeline: sort, paginate, populate user/driver fields
    aggregatePipeline.push(
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: Number(limit) },
      // lookup user (again if not already looked up)
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      // lookup driver
      {
        $lookup: {
          from: "users",
          localField: "driverId",
          foreignField: "_id",
          as: "driver",
        },
      },
      { $unwind: { path: "$driver", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          // ride fields
          userId: 1,
          driverId: 1,
          rideType: 1,
          vehicleType: 1,
          from: 1,
          to: 1,
          distanceMiles: 1,
          fareUSD: 1,
          fareFoodUSD: 1,
          farePackageUSD: 1,
          status: 1,
          meta: 1,
          createdAt: 1,
          // user summary
          user: {
            _id: "$user._id",
            fullName: "$user.fullName",
            email: "$user.email",
            phone: "$user.phone",
            profileImageKey: "$user.profileImageKey",
            isActive: "$user.isActive",
          },
          // driver summary
          driver: {
            _id: "$driver._id",
            fullName: "$driver.fullName",
            email: "$driver.email",
            phone: "$driver.phone",
            profileImageKey: "$driver.profileImageKey",
            isActive: "$driver.isActive",
          },
        },
      }
    );

    const items = await RideRequest.aggregate(aggregatePipeline).exec();

    // Map to add profileImageUrl using your util
    const mapped = items.map((it) => {
      const user = it.user || null;
      const driver = it.driver || null;

      if (user && user.profileImageKey) {
        user.profileImageUrl = buildProfileImageUrl(user.profileImageKey);
      } else if (user) {
        user.profileImageUrl = null;
      }

      if (driver && driver.profileImageKey) {
        driver.profileImageUrl = buildProfileImageUrl(driver.profileImageKey);
      } else if (driver) {
        driver.profileImageUrl = null;
      }

      return {
        ...it,
        user,
        driver,
      };
    });

    const pages = Math.max(1, Math.ceil(total / Number(limit) || 1));

    return {
      meta: { page: Number(page), limit: Number(limit), total, pages },
      items: mapped,
    };
  }

  /**
   * Get single ride by id and populate user & driver minimal details
   */
  async getRide(rideId) {
    if (!isValidObjectId(rideId)) {
      const e = new Error("Invalid ride id");
      e.statusCode = 400;
      throw e;
    }

    const ride = await RideRequest.findById(rideId).lean().exec();

    if (!ride) {
      const e = new Error("Ride not found");
      e.statusCode = 404;
      throw e;
    }

    // populate user and driver
    const [user, driver] = await Promise.all([
      ride.userId
        ? User.findById(ride.userId)
            .select("-password -__v -lastAuthToken")
            .lean()
        : null,
      ride.driverId
        ? User.findById(ride.driverId)
            .select("-password -__v -lastAuthToken")
            .lean()
        : null,
    ]);

    if (user) {
      user.profileImageUrl =
        require("../../utils/profile-image").buildProfileImageUrl(
          user.profileImageKey
        );
    }
    if (driver) {
      driver.profileImageUrl =
        require("../../utils/profile-image").buildProfileImageUrl(
          driver.profileImageKey
        );
    }

    return {
      ...ride,
      user,
      driver,
    };
  }

  /**
   * Assign or reassign driver to a ride.
   * - rideId: ride id
   * - driverId: user id of a driver
   * - adminId: who performed assignment (for logging)
   */
  async assignDriver(rideId, driverId, adminId = null) {
    if (!isValidObjectId(rideId)) {
      const e = new Error("Invalid ride id");
      e.statusCode = 400;
      throw e;
    }
    if (!isValidObjectId(driverId)) {
      const e = new Error("Invalid driver id");
      e.statusCode = 400;
      throw e;
    }

    const ride = await RideRequest.findById(rideId).exec();
    if (!ride) {
      const e = new Error("Ride not found");
      e.statusCode = 404;
      throw e;
    }

    const driver = await User.findById(driverId).exec();
    if (!driver || driver.role !== "driver") {
      const e = new Error("Driver not found");
      e.statusCode = 404;
      throw e;
    }

    // Basic driver validations (not blocked, active, approved)
    if (driver.isBlocked) {
      const e = new Error("Driver is blocked");
      e.statusCode = 400;
      throw e;
    }
    if (!driver.isActive) {
      const e = new Error("Driver is not active");
      e.statusCode = 400;
      throw e;
    }
    if (!driver.isAdminApproved) {
      const e = new Error("Driver is not approved by admin");
      e.statusCode = 400;
      throw e;
    }

    // If ride already completed/cancelled -> don't reassign
    if (["completed", "cancelled"].includes(ride.status)) {
      const e = new Error(
        "Cannot assign driver to a completed or cancelled ride"
      );
      e.statusCode = 400;
      throw e;
    }

    ride.driverId = new Types.ObjectId(driverId);
    // Optionally change status to pending/accepted depending on your business logic.
    // Here we set to 'accepted' if previously 'created' or 'pending' becomes 'accepted'
    if (["created", "pending"].includes(ride.status)) {
      ride.status = "pending";
    }

    // Optionally log in meta
    ride.meta = ride.meta || {};
    ride.meta.lastAssignedBy = adminId;
    ride.meta.lastAssignedAt = new Date();

    await ride.save();

    // Optionally: push notification to driver, emit events, etc. (not implemented here)

    return;
  }

  /**
   * Update ride status. Valid statuses: created, pending, accepted, ongoing, completed, cancelled
   * reason optional for cancellations
   */
  async updateStatus(rideId, status, reason = "", adminId = null) {
    // Admin endpoint only allows 'cancelled'
    const allowedStatusesForAdmin = ["cancelled"];

    if (!isValidObjectId(rideId)) {
      const e = new Error("Invalid ride id");
      e.statusCode = 400;
      throw e;
    }

    if (!status || !allowedStatusesForAdmin.includes(status)) {
      const e = new Error("Admins can only cancel rides");
      e.statusCode = 403;
      throw e;
    }

    const ride = await RideRequest.findById(rideId).exec();
    if (!ride) {
      const e = new Error("Ride not found");
      e.statusCode = 404;
      throw e;
    }

    // If ride already in terminal state, disallow any changes
    if (["completed", "cancelled"].includes(ride.status)) {
      const e = new Error(`Cannot change status from ${ride.status}`);
      e.statusCode = 400;
      throw e;
    }

    // Admin can cancel only when ride was accepted by driver
    if (status === "cancelled") {
      if (ride.status !== "accepted") {
        const e = new Error("Ride is not accepted by the driver");
        e.statusCode = 400;
        throw e;
      }

      // Proceed with cancellation
      ride.status = "cancelled";
      ride.meta = ride.meta || {};
      ride.meta.cancelReason = reason || "";
      ride.meta.cancelledByAdmin = adminId;
      ride.meta.cancelledAt = new Date();

      await ride.save();

      // Optionally: notify user/driver, trigger refunds/settlements, emit events etc.
      return;
    }

    // Defensive fallback: should not reach here because validation prevents other statuses
    const e = new Error("Invalid operation");
    e.statusCode = 400;
    throw e;
  }
}

module.exports = new AdminRideService();
