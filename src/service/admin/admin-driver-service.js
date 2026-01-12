const path = require("path");
const fs = require("fs");
const User = require("../../models/User");
const { isValidObjectId, Types } = require("mongoose");
const Ride = require("../../models/RideRequest"); // <- correct model
const Review = require("../../models/Review");
const { buildProfileImageUrl } = require("../../utils/profile-image");
const { s3Utils } = require("../../config/aws-s3");

class AdminDriverService {
  constructor() {}

  /**
   * listDrivers with status filter: pending|approved|rejected|blocked|all
   */
  async listDrivers({ page = 1, limit = 25, search, status = "approved" }) {
    const q = { role: "driver" };

    if (status && status !== "all") {
      switch (status) {
        case "pending":
          q.isApproved = { $ne: true };
          break;
        case "approved":
          q.isApproved = true;
          break;
        case "rejected":
          q.isApproved = false;
          q.isRejected = true;
          break;
        case "blocked":
          q.isBlocked = true;
          break;
      }
    }

    if (search) {
      const s = search.trim();
      q.$or = [
        { fullName: { $regex: s, $options: "i" } },
        { email: { $regex: s, $options: "i" } },
        { phone: { $regex: s, $options: "i" } },
        { "vehicle.plate": { $regex: s, $options: "i" } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [total, rawItems] = await Promise.all([
      User.countDocuments(q),
      User.find(q)
        .select("-password -__v -lastAuthToken")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
    ]);

    // 👉 Inject profileImageUrl
    const items = rawItems.map((driver) => ({
      ...driver,
      profileImageUrl: buildProfileImageUrl(driver.profileImageKey),
    }));

    return {
      meta: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit) || 1),
      },
      items,
    };
  }

  async getDriver(driverId) {
    const driver = await User.findOne({ _id: driverId, role: "driver" })
      .select("-password -__v -lastAuthToken")
      .lean();

    if (!driver) {
      const e = new Error("Driver not found");
      e.statusCode = 404;
      throw e;
    }

    // Add profileImageUrl
    const profileImageUrl = buildProfileImageUrl(driver.profileImageKey);

    return {
      ...driver,
      profileImageUrl,
    };
  }

  async updateDriver(driverId, updates = {}, file = null) {
    if (!isValidObjectId(driverId)) {
      const e = new Error("Invalid driver id");
      e.statusCode = 400;
      throw e;
    }

    // Prevent forbidden changes
    if (
      updates.email !== undefined ||
      updates.role !== undefined ||
      updates.password !== undefined
    ) {
      const e = new Error(
        "You are not allowed to change email, role, or password via this endpoint"
      );
      e.statusCode = 403;
      throw e;
    }

    const dbDriver = await User.findOne({
      _id: driverId,
      role: "driver",
    }).exec();
    if (!dbDriver) {
      const e = new Error("Driver not found");
      e.statusCode = 404;
      throw e;
    }

    let changed = false;

    // Allowed simple fields
    const allowed = ["fullName", "phone", "bio", "gender"];
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(updates, key)) {
        dbDriver[key] = updates[key];
        changed = true;
      }
    }

    // Handle location (string or object)
    if (updates.location) {
      let loc = updates.location;
      if (typeof loc === "string") {
        try {
          loc = JSON.parse(loc);
        } catch (err) {
          const e = new Error("Invalid JSON for location");
          e.statusCode = 400;
          throw e;
        }
      }

      if (!loc || loc.type !== "Point") {
        const e = new Error('location.type must equal "Point"');
        e.statusCode = 400;
        throw e;
      }
      if (!Array.isArray(loc.coordinates) || loc.coordinates.length !== 2) {
        const e = new Error(
          "location.coordinates must be an array of two numbers [lng, lat]"
        );
        e.statusCode = 400;
        throw e;
      }

      dbDriver.location = {
        type: "Point",
        coordinates: loc.coordinates.map(Number),
        address:
          loc.address || (dbDriver.location && dbDriver.location.address) || "",
      };
      changed = true;
    }

    // Handle profile image (req.file)
    if (file) {
      // Determine new profile image key
      let newKey = null;
      if (file.key && typeof file.key === "string" && file.key.length) {
        newKey = file.key;
      } else if (file.path) {
        const rel = path.relative(process.cwd(), file.path).replace(/\\/g, "/");
        newKey = rel.startsWith("uploads/") ? rel : `uploads/${rel}`;
      } else if (file.filename && file.destination) {
        const rel = path
          .relative(process.cwd(), path.join(file.destination, file.filename))
          .replace(/\\/g, "/");
        newKey = rel.startsWith("uploads/") ? rel : `uploads/${rel}`;
      } else {
        const ext = path.extname(file.originalname || "") || "";
        newKey = `uploads/images/${Date.now()}-${Math.random()
          .toString(36)
          .substring(2)}${ext}`;
      }

      // attempt delete previous (non-fatal)
      const previousKey = dbDriver.profileImageKey;
      if (previousKey && previousKey !== newKey) {
        try {
          const looksLocal = String(previousKey).startsWith("uploads/");
          if (!looksLocal) {
            if (
              s3Utils &&
              typeof s3Utils.isConfigured === "function" &&
              s3Utils.isConfigured()
            ) {
              if (typeof s3Utils.deleteFile === "function") {
                await s3Utils.deleteFile(previousKey).catch((err) => {
                  console.error("S3 deleteFile failed (non-fatal):", err);
                });
              }
            }
          } else {
            try {
              const localPath = path.join(
                process.cwd(),
                previousKey.replace(/^\/+/, "")
              );
              if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
            } catch (err) {
              console.error(
                "Failed to delete previous local file (non-fatal):",
                err
              );
            }
          }
        } catch (err) {
          console.error(
            "Error while deleting previous profile image (non-fatal):",
            err
          );
        }
      }

      dbDriver.profileImageKey = newKey;
      changed = true;
    }

    if (!changed) {
      // return sanitized driver
      const safe = await User.findById(driverId)
        .select("-password -__v -lastAuthToken")
        .lean()
        .exec();
      return {
        ...safe,
        profileImageUrl: buildProfileImageUrl(safe.profileImageKey),
      };
    }

    await dbDriver.save();

    // return sanitized driver with profileImageUrl and performance metrics (getDriver handles metrics)
    const safe = await User.findById(driverId)
      .select("-password -__v -lastAuthToken")
      .lean()
      .exec();
    return {
      ...safe,
      profileImageUrl: buildProfileImageUrl(safe.profileImageKey),
    };
  }

  async approveDriver(driverId, action, reason = "", adminId = null) {
    const driver = await User.findOne({ _id: driverId, role: "driver" }).exec();
    if (!driver) {
      const e = new Error("Driver not found");
      e.statusCode = 404;
      throw e;
    }

    if (action === "approve") {
      driver.isAdminApproved = true;
    } else {
      const e = new Error("Invalid action");
      e.statusCode = 400;
      throw e;
    }

    await driver.save();
    return;
  }

  async blockDriver(driverId, action, reason = "", adminId = null) {
    const driver = await User.findOne({ _id: driverId, role: "driver" }).exec();
    if (!driver) {
      const e = new Error("Driver not found");
      e.statusCode = 404;
      throw e;
    }

    if (action === "block") {
      driver.isActive = false;
      driver.tokenInvalidBefore = new Date();
    } else if (action === "unblock") {
      driver.isActive = true;
    } else {
      const e = new Error("Invalid action");
      e.statusCode = 400;
      throw e;
    }

    // Optionally record moderation log
    await driver.save();
    return;
  }

  async getDriverRidesAndMetrics(driverId, { page = 1, limit = 25 } = {}) {
    if (!isValidObjectId(driverId)) {
      const e = new Error("Invalid driver id");
      e.statusCode = 400;
      throw e;
    }

    const skip = (Number(page) - 1) * Number(limit);

    let ridesResult = {
      meta: { page: Number(page), limit: Number(limit), total: 0, pages: 0 },
      items: [],
    };

    if (Ride && typeof Ride.find === "function") {
      const q = { driverId: new Types.ObjectId(driverId) }; // use driverId as per schema

      const [total, items] = await Promise.all([
        Ride.countDocuments(q),
        Ride.find(q)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit))
          .lean(),
      ]);

      const pages = Math.max(1, Math.ceil(total / Number(limit) || 1));
      ridesResult = {
        meta: { page: Number(page), limit: Number(limit), total, pages },
        items,
      };
    }

    const metrics = await this._computeDriverMetrics(driverId);

    return { rides: ridesResult, metrics };
  }

  /**
   * Internal: compute aggregated metrics for driver: totalRides, avgRating, totalEarnings, ratingCount
   */
  async _computeDriverMetrics(driverId) {
    const metrics = {
      totalRides: 0,
      avgRating: null,
      totalEarnings: 0,
      ratingCount: 0,
    };

    try {
      // aggregate rides => total count and sum of fareUSD
      if (Ride && typeof Ride.aggregate === "function") {
        const rideAgg = await Ride.aggregate([
          { $match: { driverId: new Types.ObjectId(driverId) } },
          {
            $group: {
              _id: null,
              totalRides: { $sum: 1 },
              totalEarnings: { $sum: { $ifNull: ["$fareUSD", 0] } },
            },
          },
        ]);

        if (Array.isArray(rideAgg) && rideAgg.length > 0) {
          metrics.totalRides = rideAgg[0].totalRides || 0;
          metrics.totalEarnings = rideAgg[0].totalEarnings || 0;
        }
      }

      // aggregate reviews => average rating and count
      if (Review && typeof Review.aggregate === "function") {
        const reviewAgg = await Review.aggregate([
          { $match: { driverId: new Types.ObjectId(driverId) } },
          {
            $group: {
              _id: null,
              avgRating: { $avg: "$rating" },
              ratingCount: { $sum: 1 },
            },
          },
        ]);

        if (Array.isArray(reviewAgg) && reviewAgg.length > 0) {
          metrics.avgRating =
            reviewAgg[0].avgRating != null
              ? Number(reviewAgg[0].avgRating)
              : null;
          metrics.ratingCount = reviewAgg[0].ratingCount || 0;
        }
      }
    } catch (err) {
      // non-fatal - log and return partial metrics
      console.error("Driver metrics computation failed:", err);
    }

    return metrics;
  }
}

module.exports = new AdminDriverService();
