// src/services/ride-service.js
const mongoose = require("mongoose");
const rideRepo = require("../repositories/ride-repository");
const User = require("../models/User");
const Vehicle = require("../models/Vehicle");
const RideConfig = require("../models/RideConfig");
const RideRequestModel = require("../models/RideRequest");
const Review = require("../models/Review");
const socketManager = require("../sockets/socket-manager");
const liveDriverStore = require("../stores/live-driver-store");
const { s3Utils } = require("../config/aws-s3");
const sendNotification = require("../utils/sendNotification");
const moment = require("moment-timezone");

class RideService {
  constructor() {
    this.APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:4000";
    this.maxRecent = 3;
  }

  /* -------------------- helpers -------------------- */

  // haversine formula (miles)
  haversineMiles([lng1, lat1], [lng2, lat2]) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 3958.8;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // calculateFare(vehicleType, distanceMiles) {
  //   const rates = { car_standard: 2, car_deluxe: 3, motorcycle_standard: 1 };
  //   const perMile = rates[vehicleType] || 2;
  //   return Math.round(distanceMiles * perMile * 100) / 100;
  // }

  async calculateFare(vehicleType, distanceMiles) {
    const config = await RideConfig.getConfig();

    const rates = {
      car_standard: config.carStandardRate,
      car_deluxe: config.carDeluxeRate,
      motorcycle_standard: config.motorcycleStandardRate,
    };

    const perMile = rates[vehicleType] ?? config.carStandardRate;
    const fare = Math.round(distanceMiles * perMile * 100) / 100;

    return fare;
  }

  _emitToUser(userId, event, payload) {
    const io = socketManager.getIo();
    if (io) io.to(`user:${userId}`).emit(event, payload);
  }

  _emitToDriver(driverId, event, payload) {
    const io = socketManager.getIo();
    if (io) io.to(`driver:${driverId}`).emit(event, payload);
  }

  _emitToRideRoom(rideId, event, payload) {
    const io = socketManager.getIo();
    if (io) io.to(`ride:${rideId}`).emit(event, payload);
  }

  _joinRideRoomForDriverAndUser(driverId, userId, rideId) {
    const io = socketManager.getIo();
    if (!io) return;
    const driverRoom = `driver:${driverId}`;
    const userRoom = `user:${userId}`;
    const rideRoom = `ride:${rideId}`;

    // get socket ids in driver/user rooms and add them to ride room
    return Promise.all([
      io.in(driverRoom).allSockets(),
      io.in(userRoom).allSockets(),
    ])
      .then(([driverSockets, userSockets]) => {
        for (const sid of driverSockets) {
          const sock = io.sockets.sockets.get(sid);
          if (sock) sock.join(rideRoom);
        }
        for (const sid of userSockets) {
          const sock = io.sockets.sockets.get(sid);
          if (sock) sock.join(rideRoom);
        }
      })
      .catch((err) => {
        console.error("joinRideRoom error", err);
      });
  }

  // helper to check if key is local
  isLocalKey(key) {
    if (!key || typeof key !== "string") return false;
    return key.startsWith("uploads/");
  }

  buildProfileImage(key) {
    if (!key) return null;
    const k = String(key).trim();
    // already a full URL
    if (/^(https?:)?\/\//i.test(k)) {
      return k;
    }

    // local file
    if (this.isLocalKey(k)) {
      if (!this.APP_BASE_URL) {
        console.log("APP_BASE_URL not set");
        return k; // fallback to raw key
      }

      return `${this.APP_BASE_URL.replace(/\/$/, "")}/${k.replace(/^\/+/, "")}`;
    }

    // S3 file
    if (s3Utils && typeof s3Utils.getFileUrl === "function") {
      try {
        const url = s3Utils.getFileUrl(k);
        return url || k; // fallback to raw key if S3 util fails
      } catch (e) {
        console.error("s3Utils.getFileUrl failed", e);
        return k; // fallback to raw key
      }
    }
    // fallback: return raw key
    return k;
  }

  /* -------------------- core flows -------------------- */

  /**
   * createInstantRide - simple create (keeps status 'created')
   */
  async createInstantRide({
    userId,
    from,
    to,
    vehicleType,
    rideType = "instant",
  }) {
    const distanceMiles = this.haversineMiles(from.coordinates, to.coordinates);
    const fareUSD = await this.calculateFare(vehicleType, distanceMiles);

    const ride = await rideRepo.create({
      userId,
      rideType,
      vehicleType,
      from,
      to,
      distanceMiles,
      fareUSD,
      status: "created",
      meta: { events: [] },
    });

    // append create event
    await rideRepo.appendEvent(ride._id, {
      type: "ride_created",
      ts: new Date(),
      data: { userId, vehicleType, distanceMiles, fareUSD },
    });

    return ride;
  }

  async getOngoingRides({ userId, role }) {
    // 1️⃣ Fetch rides with status 'accepted' or 'ongoing'
    const rides = await RideRequestModel.find({
      status: { $in: ["accepted", "ongoing"] },
      ...(role === "driver" ? { driverId: userId } : { userId }),
    })
      .populate({
        path: role === "driver" ? "userId" : "driverId",
        select: "fullName profileImageKey gender createdAt",
      })
      .sort({ createdAt: -1 })
      .lean(); // return plain JS objects

    if (!rides || rides.length === 0) return [];

    // 2️⃣ Prepare maps for vehicle and driver stats (only needed for users)
    let vehicleMap = {};
    let reviewStatsMap = {};
    let completedCountMap = {};

    if (role === "user") {
      // collect unique driver IDs as strings from rides
      const driverIds = Array.from(
        new Set(
          rides
            .map((r) => (r.driverId ? String(r.driverId._id) : null))
            .filter(Boolean)
        )
      );

      if (driverIds.length > 0) {
        const driverObjectIds = driverIds.map(
          (id) => new mongoose.Types.ObjectId(id)
        );

        // Fetch vehicles for drivers (one vehicle per driver)
        const vehicles = await Vehicle.find({
          driver: { $in: driverObjectIds },
        })
          .select(
            "driver carMakeModel licensePlateNumber vehicleType rideOption"
          )
          .lean();

        vehicles.forEach((v) => {
          const key = String(v.driver);
          if (!vehicleMap[key]) {
            vehicleMap[key] = {
              carMakeModel: v.carMakeModel || null,
              licensePlateNumber: v.licensePlateNumber || null,
              vehicleType: v.vehicleType || null,
              rideOption: v.rideOption || null,
            };
          }
        });

        // Aggregate driver reviews (average rating & count)
        const reviewAgg = await Review.aggregate([
          { $match: { driverId: { $in: driverObjectIds } } },
          {
            $group: {
              _id: "$driverId",
              averageRating: { $avg: "$rating" },
              reviewCount: { $sum: 1 },
            },
          },
        ]);

        reviewAgg.forEach((r) => {
          reviewStatsMap[String(r._id)] = {
            averageRating:
              r.averageRating !== undefined && r.averageRating !== null
                ? Number(r.averageRating.toFixed(2))
                : null,
            reviewCount: r.reviewCount || 0,
          };
        });

        // Count completed rides per driver
        const completedAgg = await RideRequestModel.aggregate([
          {
            $match: { driverId: { $in: driverObjectIds }, status: "completed" },
          },
          {
            $group: {
              _id: "$driverId",
              completed: { $sum: 1 },
            },
          },
        ]);

        completedAgg.forEach((c) => {
          completedCountMap[String(c._id)] = c.completed || 0;
        });
      }
    }

    // 3️⃣ Build final response array
    const result = rides.map((ride) => {
      if (role === "driver") {
        // requester is driver -> include minimal user object
        const userPop = ride.userId || null;
        ride.user = userPop
          ? {
              id: String(userPop._id),
              fullName: userPop.fullName || null,
              profileImage: this.buildProfileImage(userPop.profileImageKey),
            }
          : null;
      } else if (role === "user") {
        // requester is user -> include driver object with vehicle + stats
        const drv = ride.driverId || null;
        if (drv) {
          const driverIdStr = String(drv._id);
          ride.driver = {
            id: driverIdStr,
            fullName: drv.fullName || null,
            profileImage: this.buildProfileImage(drv.profileImageKey),
            gender: drv.gender || null,
            memberSince: drv.createdAt ? drv.createdAt.toISOString() : null,
            completedRides: completedCountMap[driverIdStr] || 0,
            averageRating:
              reviewStatsMap[driverIdStr] &&
              reviewStatsMap[driverIdStr].averageRating !== undefined
                ? reviewStatsMap[driverIdStr].averageRating
                : null,
            vehicle: vehicleMap[driverIdStr] || null,
          };
        } else {
          ride.driver = null;
        }
      }

      // Remove populated fields
      delete ride.userId;
      delete ride.driverId;

      return ride;
    });

    return result;
  }

  /**
   * sendRideRequestUsingLiveDrivers - uses liveDriverStore to get drivers and notifies them.
   * Creates/updates ride to 'pending'.
   */
  // async sendRideRequestUsingLiveDrivers(payload, options = {}) {
  //   const {
  //     rideId,
  //     userId,
  //     rideType = "instant",
  //     vehicleType,
  //     from,
  //     to,
  //     distanceMiles,
  //     fareUSD,
  //   } = payload;
  //   if (!userId) {
  //     const e = new Error("userId required");
  //     e.statusCode = 400;
  //     throw e;
  //   }
  //   if (!vehicleType) {
  //     const e = new Error("vehicleType required");
  //     e.statusCode = 400;
  //     throw e;
  //   }
  //   if (
  //     !from ||
  //     !Array.isArray(from.coordinates) ||
  //     from.coordinates.length !== 2
  //   ) {
  //     const e = new Error("from.coordinates required");
  //     e.statusCode = 400;
  //     throw e;
  //   }

  //   const user = await User.findById(userId)
  //     .select("_id fullName profileImageKey")
  //     .lean();
  //   if (!user) {
  //     const e = new Error("User not found");
  //     e.statusCode = 404;
  //     throw e;
  //   }

  //   let ride;
  //   if (rideId) {
  //     ride = await rideRepo.updateStatus(rideId, "pending");
  //     if (!ride) {
  //       const e = new Error("Ride not found");
  //       e.statusCode = 404;
  //       throw e;
  //     }
  //   } else {
  //     ride = await rideRepo.create({
  //       userId,
  //       rideType,
  //       vehicleType,
  //       from,
  //       to,
  //       distanceMiles,
  //       fareUSD,
  //       status: "pending",
  //       meta: { events: [] },
  //     });
  //   }

  //   // append event: request sent
  //   await rideRepo.appendEvent(ride._id, {
  //     type: "ride_requested",
  //     ts: new Date(),
  //     data: { userId, vehicleType, fareUSD, distanceMiles },
  //   });

  //   // find nearby live drivers
  //   const radius = options.radiusMiles || this.defaultRadiusMiles;
  //   const maxDrivers = options.maxDrivers || this.maxNotifyDrivers;
  //   const nearby = liveDriverStore.findWithinRadius(from.coordinates, {
  //     radiusMiles: radius,
  //     max: maxDrivers,
  //     haversineMiles: this.haversineMiles.bind(this),
  //   });

  //   const io = socketManager.getIo();
  //   const driverPayloads = [];

  //   // batch fetch profiles and vehicles for the driver ids to avoid per-driver DB calls
  //   const driverIds = nearby.map((d) => d.driverId);
  //   let profilesMap = new Map();
  //   let vehiclesMap = new Map();
  //   if (driverIds.length) {
  //     const profiles = await User.find({ _id: { $in: driverIds } })
  //       .select("_id fullName profileImageKey createdAt")
  //       .lean();

  //     profilesMap = new Map(
  //       profiles.map((p) => {
  //         const profile = { ...p };

  //         const key = profile.profileImageKey || profile.profileImage || null;
  //         profile.profileImage = key
  //           ? this.buildProfileImage(key)
  //           : null;

  //         // remove the raw key so only profileImage remains
  //         delete profile.profileImageKey;

  //         return [String(profile._id), profile];
  //       })
  //     );

  //     // profilesMap = new Map(profiles.map((p) => [String(p._id), p]));
  //     const vehicles = await Vehicle.find({ driver: { $in: driverIds } })
  //       .select("driver carMakeModel licensePlateNumber rideOption vehicleType")
  //       .lean();
  //     vehiclesMap = new Map(vehicles.map((v) => [String(v.driver), v]));
  //   }

  //   for (const drv of nearby) {
  //     const profile = profilesMap.get(drv.driverId) || null;
  //     const vehicle = vehiclesMap.get(drv.driverId) || null;

  //     const driverPayload = {
  //       rideId: String(ride._id),
  //       userId: String(user._id),
  //       userName: user.fullName || "Unknown",
  //       userProfileImage: user.profileImage || null,
  //       rideType,
  //       vehicleType,
  //       fareUSD,
  //       distanceMiles: distanceMiles || null,
  //       distanceFromDriverMiles: drv.distanceMiles,
  //       from,
  //       to,
  //       driverSummary: {
  //         id: drv.driverId,
  //         name: profile?.fullName || null,
  //         profileImage: profile?.profileImage || null,
  //         memberSince: profile?.createdAt || null,
  //       },
  //       vehicleSummary: vehicle
  //         ? {
  //             carMakeModel: vehicle.carMakeModel || null,
  //             licensePlateNumber: vehicle.licensePlateNumber || null,
  //             rideOption: vehicle.rideOption || null,
  //             vehicleType: vehicle.vehicleType || null,
  //           }
  //         : null,
  //       createdAt: ride.createdAt,
  //     };

  //     if (io)
  //       io.to(`driver:${drv.driverId}`).emit("ride:new_request", driverPayload);
  //     driverPayloads.push({
  //      status: true,
  //      message: "You have a new ride request",
  //      data: {
  //       driverId: String(drv.driverId),
  //       payload: driverPayload,
  //      }
  //     });
  //   }

  //   return {
  //     ride,
  //     notifiedDriversCount: driverPayloads.length,
  //     driverPayloads,
  //   };
  // }

  // async sendRideRequestUsingLiveDrivers(payload, options = {}) {
  //   const {
  //     rideId,
  //     userId,
  //     rideType = "instant",
  //     vehicleType,
  //     from,
  //     to,
  //     distanceMiles,
  //     fareUSD,
  //   } = payload;

  //   if (!userId) {
  //     const e = new Error("userId required");
  //     e.statusCode = 400;
  //     throw e;
  //   }
  //   if (!vehicleType) {
  //     const e = new Error("vehicleType required");
  //     e.statusCode = 400;
  //     throw e;
  //   }
  //   if (
  //     !from ||
  //     !Array.isArray(from.coordinates) ||
  //     from.coordinates.length !== 2
  //   ) {
  //     const e = new Error("from.coordinates required");
  //     e.statusCode = 400;
  //     throw e;
  //   }

  //   const user = await User.findById(userId)
  //     .select("_id fullName profileImageKey")
  //     .lean();
  //   if (!user) {
  //     const e = new Error("User not found");
  //     e.statusCode = 404;
  //     throw e;
  //   }

  //   // Build full URL for user profile image
  //   const userProfileImage = user.profileImageKey
  //     ? this.buildProfileImage(user.profileImageKey)
  //     : null;

  //   let ride;
  //   if (rideId) {
  //     ride = await rideRepo.updateStatus(rideId, "pending");
  //     if (!ride) {
  //       const e = new Error("Ride not found");
  //       e.statusCode = 404;
  //       throw e;
  //     }
  //   } else {
  //     ride = await rideRepo.create({
  //       userId,
  //       rideType,
  //       vehicleType,
  //       from,
  //       to,
  //       distanceMiles,
  //       fareUSD,
  //       status: "pending",
  //       meta: { events: [] },
  //     });
  //   }

  //   // append event: request sent
  //   await rideRepo.appendEvent(ride._id, {
  //     type: "ride_requested",
  //     ts: new Date(),
  //     data: { userId, vehicleType, fareUSD, distanceMiles },
  //   });

  //   // find nearby live drivers
  //   const radius = options.radiusMiles || this.defaultRadiusMiles;
  //   const maxDrivers = options.maxDrivers || this.maxNotifyDrivers;
  //   const nearby = liveDriverStore.findWithinRadius(from.coordinates, {
  //     radiusMiles: radius,
  //     max: maxDrivers,
  //     haversineMiles: this.haversineMiles.bind(this),
  //   });

  //   const io = socketManager.getIo();
  //   const driverPayloads = [];

  //   // batch fetch profiles and vehicles for the driver ids
  //   const driverIds = nearby.map((d) => d.driverId);
  //   let profilesMap = new Map();
  //   let vehiclesMap = new Map();
  //   if (driverIds.length) {
  //     const profiles = await User.find({ _id: { $in: driverIds } })
  //       .select("_id fullName profileImageKey createdAt")
  //       .lean();

  //     profilesMap = new Map(
  //       profiles.map((p) => {
  //         const profile = { ...p };
  //         const key = profile.profileImageKey || profile.profileImage || null;
  //         profile.profileImage = key ? this.buildProfileImage(key) : null;
  //         delete profile.profileImageKey;
  //         return [String(profile._id), profile];
  //       })
  //     );

  //     const vehicles = await Vehicle.find({ driver: { $in: driverIds } })
  //       .select("driver carMakeModel licensePlateNumber rideOption vehicleType")
  //       .lean();

  //     vehiclesMap = new Map(vehicles.map((v) => [String(v.driver), v]));
  //   }

  //   for (const drv of nearby) {
  //     const profile = profilesMap.get(drv.driverId) || null;
  //     const vehicle = vehiclesMap.get(drv.driverId) || null;

  //     const driverPayload = {
  //       rideId: String(ride._id),
  //       userId: String(user._id),
  //       userName: user.fullName || "Unknown",
  //       userProfileImage, // <-- full URL now
  //       rideType,
  //       vehicleType,
  //       fareUSD,
  //       distanceMiles: distanceMiles || null,
  //       distanceFromDriverMiles: drv.distanceMiles,
  //       from,
  //       to,
  //       driverSummary: {
  //         id: drv.driverId,
  //         name: profile?.fullName || null,
  //         profileImage: profile?.profileImage || null,
  //         memberSince: profile?.createdAt || null,
  //       },
  //       vehicleSummary: vehicle
  //         ? {
  //             carMakeModel: vehicle.carMakeModel || null,
  //             licensePlateNumber: vehicle.licensePlateNumber || null,
  //             rideOption: vehicle.rideOption || null,
  //             vehicleType: vehicle.vehicleType || null,
  //           }
  //         : null,
  //       createdAt: ride.createdAt,
  //     };

  //     if (io)
  //       io.to(`driver:${drv.driverId}`).emit("ride:new_request", {
  //         status: true,
  //         message: "You have a new ride request",
  //         data: driverPayload,
  //       });

  //     driverPayloads.push({
  //       status: true,
  //       message: "You have a new ride request",
  //       data: {
  //         driverId: String(drv.driverId),
  //         payload: driverPayload,
  //       },
  //     });
  //   }

  //   return {
  //     ride,
  //     notifiedDriversCount: driverPayloads.length,
  //     driverPayloads,
  //   };
  // }

  async sendRideRequestUsingLiveDrivers(payload, options = {}) {
    const {
      rideId,
      userId,
      rideType = "instant",
      vehicleType,
      from,
      to,
      distanceMiles,
      fareUSD,
    } = payload;

    if (!userId) {
      const e = new Error("userId required");
      e.statusCode = 400;
      throw e;
    }
    if (!vehicleType) {
      const e = new Error("vehicleType required");
      e.statusCode = 400;
      throw e;
    }
    if (
      !from ||
      !Array.isArray(from.coordinates) ||
      from.coordinates.length !== 2
    ) {
      const e = new Error("from.coordinates required");
      e.statusCode = 400;
      throw e;
    }

    const user = await User.findById(userId)
      .select("_id fullName profileImageKey")
      .lean();
    if (!user) {
      const e = new Error("User not found");
      e.statusCode = 404;
      throw e;
    }

    // Build full URL for user profile image
    const userProfileImage = user.profileImageKey
      ? this.buildProfileImage(user.profileImageKey)
      : null;

    let ride;
    if (rideId) {
      ride = await rideRepo.updateStatus(rideId, "pending");
      if (!ride) {
        const e = new Error("Ride not found");
        e.statusCode = 404;
        throw e;
      }
    } else {
      ride = await rideRepo.create({
        userId,
        rideType,
        vehicleType,
        from,
        to,
        distanceMiles,
        fareUSD,
        status: "pending",
        meta: { events: [] },
      });
    }

    // append event: request sent
    await rideRepo.appendEvent(ride._id, {
      type: "ride_requested",
      ts: new Date(),
      data: { userId, vehicleType, fareUSD, distanceMiles },
    });

    // find nearby live drivers
    const config = await RideConfig.getConfig();
    const radius = options.radiusMiles || config.defaultRadiusMiles;
    const maxDrivers = options.maxDrivers || config.maxNotifyDrivers;
    const nearby = liveDriverStore.findWithinRadius(from.coordinates, {
      radiusMiles: radius,
      max: maxDrivers,
      haversineMiles: this.haversineMiles.bind(this),
    });

    const io = socketManager.getIo();
    const driverPayloads = [];

    // batch fetch profiles and vehicles for the driver ids
    const driverIds = nearby.map((d) => d.driverId);
    let profilesMap = new Map();
    let vehiclesMap = new Map();
    if (driverIds.length) {
      const profiles = await User.find({ _id: { $in: driverIds } })
        .select("_id fullName profileImageKey createdAt")
        .lean();

      profilesMap = new Map(
        profiles.map((p) => {
          const profile = { ...p };
          const key = profile.profileImageKey || profile.profileImage || null;
          profile.profileImage = key ? this.buildProfileImage(key) : null;
          delete profile.profileImageKey;
          return [String(profile._id), profile];
        })
      );

      const vehicles = await Vehicle.find({ driver: { $in: driverIds } })
        .select("driver carMakeModel licensePlateNumber rideOption vehicleType")
        .lean();

      vehiclesMap = new Map(vehicles.map((v) => [String(v.driver), v]));
    }

    // Filter nearby drivers by matching rideOption === requested vehicleType
    const eligibleDrivers = nearby.filter((d) => {
      const veh = vehiclesMap.get(d.driverId);
      // Only notify drivers that have a vehicle and whose rideOption strictly matches
      return veh && String(veh.rideOption) === String(vehicleType);
    });

    for (const drv of eligibleDrivers) {
      const profile = profilesMap.get(drv.driverId) || null;
      const vehicle = vehiclesMap.get(drv.driverId) || null;

      const driverPayload = {
        rideId: String(ride._id),
        userId: String(user._id),
        userName: user.fullName || "Unknown",
        userProfileImage,
        rideType,
        vehicleType,
        fareUSD,
        distanceMiles: distanceMiles || null,
        distanceFromDriverMiles: drv.distanceMiles,
        from,
        to,
        driverSummary: {
          id: drv.driverId,
          name: profile?.fullName || null,
          profileImage: profile?.profileImage || null,
          memberSince: profile?.createdAt || null,
        },
        vehicleSummary: vehicle
          ? {
              carMakeModel: vehicle.carMakeModel || null,
              licensePlateNumber: vehicle.licensePlateNumber || null,
              rideOption: vehicle.rideOption || null,
              vehicleType: vehicle.vehicleType || null,
            }
          : null,
        createdAt: ride.createdAt,
      };

      if (io)
        io.to(`driver:${drv.driverId}`).emit("ride:new_request", {
          status: true,
          message: "You have a new ride request",
          data: driverPayload,
        });

      // Send push / in-app notification
      await sendNotification(drv.driverId, {
        title: "New Ride Request",
        body: `You have a new ride request from ${user.fullName}`,
        senderId: user._id, // sender is the user who requested the ride
        data: {
          rideId: String(ride._id),
          from,
          to,
          fareUSD,
          vehicleType,
          rideType,
        },
      });

      driverPayloads.push({
        status: true,
        message: "You have a new ride request",
        data: {
          driverId: String(drv.driverId),
          payload: driverPayload,
        },
      });
    }

    return {
      ride,
      notifiedDriversCount: driverPayloads.length,
      driverPayloads,
    };
  }

  /**
   * driverAcceptRide - atomic assign, create/join ride room, mark driver meta.currentRideId,
   * and emit acceptance payload to user and ride room.
   */
  // async driverAcceptRide({ driverId, rideId }) {
  //   if (!driverId || !rideId) {
  //     const e = new Error("driverId and rideId required");
  //     e.statusCode = 400;
  //     throw e;
  //   }

  //   const updated = await rideRepo.assignDriverIfUnassigned(rideId, driverId);
  //   if (!updated) {
  //     const e = new Error("Ride already taken or not available");
  //     e.statusCode = 400;
  //     throw e;
  //   }

  //   // Append event
  //   await rideRepo.appendEvent(updated._id, {
  //     type: "driver_accepted",
  //     ts: new Date(),
  //     data: { driverId },
  //   });

  //   // join driver & user sockets to the ride room
  //   await this._joinRideRoomForDriverAndUser(
  //     driverId,
  //     updated.userId,
  //     updated._id
  //   );

  //   // set liveDriverStore meta currentRideId and mark not available
  //   const existing = liveDriverStore.get(driverId) || {};
  //   liveDriverStore.set(driverId, {
  //     coordinates:
  //       existing.coordinates ||
  //       (updated.from && updated.from.coordinates) ||
  //       null,
  //     isAvailable: false,
  //     meta: Object.assign({}, existing.meta || {}, {
  //       currentRideId: String(updated._id),
  //     }),
  //   });

  //   // enrich driver & vehicle info for rider
  //   const driver = await User.findById(driverId)
  //     .select("_id fullName profileImage createdAt gender")
  //     .lean();
  //   const vehicle = await Vehicle.findOne({ driver: driverId })
  //     .select("carMakeModel licensePlateNumber rideOption vehicleType")
  //     .lean();
  //   const completedCount = await RideRequestModel.countDocuments({
  //     driverId,
  //     status: "completed",
  //   });

  //   // emit detailed status update to user (private)
  //   this._emitToUser(updated.userId, "ride:status_update", {
  //     rideId: String(updated._id),
  //     status: updated.status, // accepted
  //     driverId: String(driverId),
  //     driver: {
  //       id: String(driverId),
  //       name: driver?.fullName || null,
  //       profileImage: driver?.profileImage || null,
  //       gender: driver?.gender ?? null,
  //       memberSince: driver?.createdAt || null,
  //       completedRides: completedCount,
  //     },
  //     vehicle: vehicle
  //       ? {
  //           carMakeModel: vehicle.carMakeModel || null,
  //           licensePlateNumber: vehicle.licensePlateNumber || null,
  //           rideOption: vehicle.rideOption || null,
  //           vehicleType: vehicle.vehicleType || null,
  //         }
  //       : null,
  //     ride: {
  //       userId: String(updated.userId),
  //       vehicleType: updated.vehicleType,
  //       from: updated.from,
  //       to: updated.to,
  //       distanceMiles: updated.distanceMiles,
  //       fareUSD: updated.fareUSD,
  //       createdAt: updated.createdAt,
  //     },
  //   });

  //   // notify ride room as well
  //   this._emitToRideRoom(updated._id, "ride:accepted", {
  //     rideId: String(updated._id),
  //     driverId: String(driverId),
  //   });

  //   return updated;
  // }

  // async driverAcceptRide({ driverId, rideId }) {
  //   if (!driverId || !rideId) {
  //     const e = new Error("driverId and rideId required");
  //     e.statusCode = 400;
  //     throw e;
  //   }

  //   const updated = await rideRepo.assignDriverIfUnassigned(rideId, driverId);
  //   if (!updated) {
  //     const e = new Error("Ride already taken or not available");
  //     e.statusCode = 400;
  //     throw e;
  //   }

  //   // Append event
  //   await rideRepo.appendEvent(updated._id, {
  //     type: "driver_accepted",
  //     ts: new Date(),
  //     data: { driverId },
  //   });

  //   // join driver & user sockets to the ride room
  //   await this._joinRideRoomForDriverAndUser(
  //     driverId,
  //     updated.userId,
  //     updated._id
  //   );

  //   // set liveDriverStore meta currentRideId and mark not available
  //   const existing = liveDriverStore.get(driverId) || {};
  //   liveDriverStore.set(driverId, {
  //     coordinates:
  //       existing.coordinates ||
  //       (updated.from && updated.from.coordinates) ||
  //       null,
  //     isAvailable: false,
  //     meta: Object.assign({}, existing.meta || {}, {
  //       currentRideId: String(updated._id),
  //     }),
  //   });

  //   // --- NEW: notify nearby drivers ---
  //   const nearbyDrivers = liveDriverStore.findWithinRadius(
  //     updated.from.coordinates,
  //     { radiusMiles: 30, haversineMiles: this.haversineMiles.bind(this) }
  //   );

  //   nearbyDrivers.forEach((d) => {
  //     if (d.driverId !== driverId) {
  //       // emit to other nearby drivers that this ride is taken
  //       this._emitToDriver(d.driverId, "ride:taken", {
  //         status: true,
  //         message: "Ride has been taken",
  //         data: {
  //           rideId: String(updated._id),
  //         },
  //       });
  //     }
  //   });

  //   // enrich driver & vehicle info for rider
  //   const driver = await User.findById(driverId)
  //     .select("_id fullName profileImageKey createdAt gender")
  //     .lean();
  //   const profileImage = driver.profileImageKey
  //     ? this.buildProfileImage(driver.profileImageKey)
  //     : null;
  //   const vehicle = await Vehicle.findOne({ driver: driverId })
  //     .select("carMakeModel licensePlateNumber rideOption vehicleType")
  //     .lean();
  //   const completedCount = await RideRequestModel.countDocuments({
  //     driverId,
  //     status: "completed",
  //   });

  //   // emit detailed status update to user (private)
  //   this._emitToUser(updated.userId, "ride:request_accepted", {
  //     status: true,
  //     message: "Ride request has been accepted",
  //     data: {
  //       rideId: String(updated._id),
  //       status: updated.status, // accepted
  //       driverId: String(driverId),
  //       driver: {
  //         id: String(driverId),
  //         name: driver?.fullName || null,
  //         profileImage: profileImage,
  //         gender: driver?.gender ?? null,
  //         memberSince: driver?.createdAt || null,
  //         completedRides: completedCount,
  //       },
  //       vehicle: vehicle
  //         ? {
  //             carMakeModel: vehicle.carMakeModel || null,
  //             licensePlateNumber: vehicle.licensePlateNumber || null,
  //             rideOption: vehicle.rideOption || null,
  //             vehicleType: vehicle.vehicleType || null,
  //           }
  //         : null,
  //       ride: {
  //         userId: String(updated.userId),
  //         vehicleType: updated.vehicleType,
  //         from: updated.from,
  //         to: updated.to,
  //         distanceMiles: updated.distanceMiles,
  //         fareUSD: updated.fareUSD,
  //         createdAt: updated.createdAt,
  //       },
  //     },
  //   });

  //   // notify ride room as well
  //   this._emitToRideRoom(updated._id, "ride:accepted", {
  //     status: true,
  //     message: "Ride request has been accepted",
  //     data: {
  //       rideId: String(updated._id),
  //       driverId: String(driverId),
  //     },
  //   });

  //   return updated;
  // }

  async driverAcceptRide({ driverId, rideId }) {
    if (!driverId || !rideId) {
      const e = new Error("driverId and rideId required");
      e.statusCode = 400;
      throw e;
    }

    // fetch ride first so we know required vehicleType (try multiple finder names for safety)
    let rideDoc = null;
    if (typeof rideRepo.findById === "function") {
      rideDoc = await rideRepo.findById(rideId);
    }
    if (!rideDoc && typeof rideRepo.getById === "function") {
      rideDoc = await rideRepo.getById(rideId);
    }
    // fallback to RideRequestModel if repo doesn't expose finder
    if (!rideDoc) {
      rideDoc = await RideRequestModel.findById(String(rideId)).lean();
    }
    if (!rideDoc) {
      const e = new Error("Ride not found");
      e.statusCode = 404;
      throw e;
    }

    const requiredVehicleType = rideDoc.vehicleType;

    // fetch driver's vehicle BEFORE attempting to assign
    const vehicle = await Vehicle.findOne({ driver: driverId })
      .select("driver carMakeModel licensePlateNumber rideOption vehicleType")
      .lean();

    if (!vehicle || !vehicle.rideOption) {
      const e = new Error("Driver has no registered vehicle");
      e.statusCode = 400;
      throw e;
    }

    // strict match check - you can alter rules here if you want a mapping/compatibility
    if (String(vehicle.rideOption) !== String(requiredVehicleType)) {
      const e = new Error(
        `Vehicle type mismatch: ride requires '${requiredVehicleType}' but driver has '${vehicle.rideOption}'`
      );
      e.statusCode = 400;
      throw e;
    }

    // // Now attempt atomic assign
    // const updated = await rideRepo.assignDriverIfUnassigned(rideId, driverId);
    // if (!updated) {
    //   const e = new Error("Ride already taken or not available");
    //   e.statusCode = 400;
    //   throw e;
    // }

    const updated = await RideRequestModel.findOneAndUpdate(
      {
        _id: rideId,
        driverId: null, // only assign if ride is unassigned
        status: { $in: ["pending", "created"] }, // optional: only pending/created
      },
      {
        $set: { driverId, status: "accepted" },
      },
      { new: true } // return updated document
    );

    if (!updated) {
      const e = new Error("Ride already taken or not available");
      e.statusCode = 400;
      throw e;
    }

    // --- NEW: Schedule ride cron compatibility ---
    if (updated.rideType === "schedule") {
      // ensure meta.schedule exists
      if (!updated.meta) updated.meta = {};
      if (!updated.meta.schedule) updated.meta.schedule = {};

      // ensure notification flags exist
      if (!updated.meta.schedule.notifications) {
        updated.meta.schedule.notifications = {
          t_minus_60: false,
          t_minus_30: false,
          t_minus_5: false,
          at_time: false,
        };
      }

      // mark ride as accepted (cron checks for accepted status)
      updated.status = "accepted";
      await RideRequestModel.updateOne(
        { _id: updated._id },
        {
          $set: {
            status: updated.status,
            "meta.schedule.notifications": updated.meta.schedule.notifications,
          },
        }
      );
    }

    // Append event
    await rideRepo.appendEvent(updated._id, {
      type: "driver_accepted",
      ts: new Date(),
      data: { driverId },
    });

    // join driver & user sockets to the ride room
    // await this._joinRideRoomForDriverAndUser(
    //   driverId,
    //   updated.userId,
    //   updated._id
    // );
    if (String(updated.driverId) === String(driverId)) {
      await this._joinRideRoomForDriverAndUser(
        driverId,
        updated.userId,
        updated._id
      );
    }

    // set liveDriverStore meta currentRideId and mark not available
    const existing = liveDriverStore.get(driverId) || {};
    liveDriverStore.set(driverId, {
      coordinates:
        existing.coordinates ||
        (updated.from && updated.from.coordinates) ||
        null,
      isAvailable: false,
      meta: Object.assign({}, existing.meta || {}, {
        currentRideId: String(updated._id),
      }),
    });

    // --- NEW: notify nearby drivers ---
    // const nearbyDrivers = liveDriverStore.findWithinRadius(
    //   updated.from.coordinates,
    //   { radiusMiles: 30, haversineMiles: this.haversineMiles.bind(this) }
    // );

    // nearbyDrivers.forEach((d) => {
    //   if (d.driverId !== driverId) {
    //     // emit to other nearby drivers that this ride is taken
    //     this._emitToDriver(d.driverId, "ride:taken", {
    //       status: true,
    //       message: "Ride has been taken",
    //       data: {
    //         rideId: String(updated._id),
    //       },
    //     });
    //   }
    // });

    if (updated && updated.from && updated.from.coordinates) {
      const nearbyDrivers = liveDriverStore.findWithinRadius(
        updated.from.coordinates,
        { radiusMiles: 30, haversineMiles: this.haversineMiles.bind(this) }
      );

      nearbyDrivers.forEach((d) => {
        if (d.driverId !== driverId) {
          // emit to other nearby drivers that this ride is taken
          this._emitToDriver(d.driverId, "ride:taken", {
            status: true,
            message: "Ride has been taken",
            data: { rideId: String(updated._id) },
          });
        }
      });
    }

    // enrich driver info (we already fetched vehicle above)
    const driver = await User.findById(driverId)
      .select("_id fullName profileImageKey createdAt gender")
      .lean();

    const profileImage = driver?.profileImageKey
      ? this.buildProfileImage(driver.profileImageKey)
      : null;

    const completedCount = await RideRequestModel.countDocuments({
      driverId,
      status: "completed",
    });

    // fetch average rating and total reviews
    const reviewStats = await Review.aggregate([
      { $match: { driverId: driver._id } },
      {
        $group: {
          _id: "$driverId",
          totalReviews: { $sum: 1 },
          averageRating: { $avg: "$rating" },
        },
      },
    ]);

    const totalReviews = reviewStats[0]?.totalReviews || 0;
    const averageRating = reviewStats[0]?.averageRating || 0;

    // emit detailed status update to user (private)
    this._emitToUser(updated.userId, "ride:request_accepted", {
      status: true,
      message: "Ride request has been accepted",
      data: {
        rideId: String(updated._id),
        status: updated.status, // accepted
        driverId: String(driverId),
        driver: {
          id: String(driverId),
          name: driver?.fullName || null,
          profileImage: profileImage,
          gender: driver?.gender ?? null,
          memberSince: driver?.createdAt || null,
          completedRides: completedCount,
          averageRating,
          totalReviews,
        },
        vehicle: vehicle
          ? {
              carMakeModel: vehicle.carMakeModel || null,
              licensePlateNumber: vehicle.licensePlateNumber || null,
              rideOption: vehicle.rideOption || null,
              vehicleType: vehicle.vehicleType || null,
            }
          : null,
        ride: {
          userId: String(updated.userId),
          vehicleType: updated.vehicleType,
          from: updated.from,
          to: updated.to,
          distanceMiles: updated.distanceMiles,
          fareUSD: updated.fareUSD,
          createdAt: updated.createdAt,
        },
      },
    });

    // notify ride room as well
    this._emitToRideRoom(updated._id, "ride:accepted", {
      status: true,
      message: "Ride request has been accepted",
      data: {
        rideId: String(updated._id),
        driverId: String(driverId),
      },
    });

    // send push / in-app notification to the user
    await sendNotification(updated.userId, {
      title: "Your Ride Has Been Accepted",
      body: `${driver?.fullName || "A driver"} has accepted your ride request.`,
      senderId: driverId,
      data: {
        rideId: String(updated._id),
        driverId: String(driverId),
        rideType: updated.rideType,
        vehicleType: updated.vehicleType,
        from: updated.from,
        to: updated.to,
        fareUSD: updated.fareUSD,
        distanceMiles: updated.distanceMiles,
      },
    }).catch((err) => {
      console.error(
        "Error sending ride accepted notification to user",
        updated.userId,
        err
      );
    });

    return updated;
  }

  /**
   * driverArrivedPickup - driver notifies they've arrived at pickup
   * Emits to ride room and private user room: driver arrived + location
   */
  async driverArrivedPickup({ driverId, rideId, location }) {
    if (!driverId || !rideId) {
      const e = new Error("driverId and rideId required");
      e.statusCode = 400;
      throw e;
    }

    // append event
    await rideRepo.appendEvent(rideId, {
      type: "driver_arrived_pickup",
      ts: new Date(),
      data: { driverId, location },
    });

    // emit to user and ride room
    const payload = {
      status: true,
      message: "driver has arrived at the pickup location",
      data: {
        rideId: String(rideId),
        driverId: String(driverId),
        location,
        ts: new Date(),
      },
    };

    // this._emitToUser(
    //   (await RideRequestModel.findById(rideId).lean()).userId,
    //   "ride:driver_arrived",
    //   payload
    // );
    this._emitToRideRoom(rideId, "ride:driver_arrived", payload);

    const ride = await RideRequestModel.findById(rideId).lean();
    if (ride && ride.userId) {
      await sendNotification(ride.userId, {
        title: "Driver Arrived",
        body: "Your driver has arrived at the pickup location.",
        senderId: driverId,
        data: {
          rideId: String(rideId),
          driverId: String(driverId),
          location,
        },
      }).catch((err) => {
        console.error(
          "Error sending driver arrived notification",
          ride.userId,
          err
        );
      });
    }

    return payload;
  }

  /**
   * driverStartRide - driver starts ride: set status -> 'ongoing' and emit event
   */
  async driverStartRide({
    driverId,
    rideId,
    startLocation,
    startTs = new Date(),
  }) {
    if (!driverId || !rideId) {
      const e = new Error("driverId and rideId required");
      e.statusCode = 400;
      throw e;
    }

    // update ride status to ongoing
    const updated = await rideRepo.updateStatus(rideId, "ongoing", {
      startAt: startTs,
    });
    if (!updated) {
      const e = new Error("Ride not found or cannot start");
      e.statusCode = 400;
      throw e;
    }

    // append event
    await rideRepo.appendEvent(rideId, {
      type: "ride_started",
      ts: startTs,
      data: { driverId, startLocation },
    });

    // emit to ride room
    this._emitToRideRoom(rideId, "ride:started", {
      status: true,
      message: "Ride has been started successfully",
      data: {
        rideId: String(rideId),
        driverId: String(driverId),
        startLocation,
        startAt: startTs,
      },
    });

    // --- SEND NOTIFICATION TO USER ---
    const ride = await RideRequestModel.findById(rideId).lean();
    if (ride && ride.userId) {
      await sendNotification(ride.userId, {
        title: "Ride Started",
        body: "Your ride has started successfully.",
        senderId: driverId,
        data: {
          rideId: String(rideId),
          driverId: String(driverId),
          startLocation,
          startAt: startTs,
        },
      }).catch((err) => {
        console.error(
          "Error sending ride started notification",
          ride.userId,
          err
        );
      });
    }

    // optionally emit to user private room too
    // this._emitToUser(updated.userId, "ride:started", {
    //   rideId: String(rideId),
    //   driverId: String(driverId),
    //   startLocation,
    //   startAt: startTs,
    // });

    return updated;
  }

  // cancelRide: actor = 'user'|'driver', actorId, rideId, reason
  async cancelRide({ actor, actorId, rideId, reason }) {
    if (!rideId) throw new Error("rideId required");
    if (!actor || !["user", "driver"].includes(actor)) {
      throw new Error("invalid actor");
    }

    // find ride
    const ride = await RideRequestModel.findById(String(rideId));
    if (!ride) throw new Error("Ride not found");

    // only allow cancellation in allowed states (you can change rules)
    if (["completed", "cancelled"].includes(ride.status)) {
      throw new Error("Ride cannot be cancelled in its current state");
    }

    // basic permission checks
    if (actor === "user" && String(ride.userId) !== String(actorId)) {
      throw new Error("Unauthorized: not the ride owner");
    }
    if (
      actor === "driver" &&
      ride.driverId &&
      String(ride.driverId) !== String(actorId)
    ) {
      throw new Error("Unauthorized: not the assigned driver");
    }

    // mark cancelled & add cancellation meta
    ride.status = "cancelled";
    ride.meta = ride.meta || {};
    ride.meta.cancelled = {
      by: actor,
      byId: String(actorId),
      reason: reason || null,
      at: new Date(),
    };

    await ride.save();

    // --- SEND NOTIFICATIONS ---
    try {
      // Determine who should be notified
      const notifyToId = actor === "user" ? ride.driverId : ride.userId;

      if (notifyToId) {
        const cancelMessage = `Ride has been cancelled by ${actor}${
          reason ? `: ${reason}` : ""
        }`;

        await sendNotification(notifyToId, {
          title: "Ride Cancelled",
          body: cancelMessage,
          senderId: actorId,
          data: {
            rideId: String(rideId),
            cancelledBy: actor,
            reason: reason || null,
          },
        });
      }
    } catch (err) {
      console.error("Error sending cancellation notification:", err);
    }

    return ride.toObject ? ride.toObject() : ride;
  }

  // // addStopToRide: userId, rideId, stop { coordinates, address }, addedChargeUSD
  // async addStopToRide({ userId, rideId, stop, addedChargeUSD = 5 }) {
  //   if (!rideId) throw new Error("rideId required");
  //   if (!userId) throw new Error("Unauthorized");

  //   const ride = await RideRequestModel.findById(String(rideId));
  //   if (!ride) throw new Error("Ride not found");

  //   // permission: only ride owner can add stop
  //   if (String(ride.userId) !== String(userId)) {
  //     throw new Error("Unauthorized: not the ride owner");
  //   }

  //   // only allow adding stops when ride is ongoing (started)
  //   if (ride.status !== "ongoing") {
  //     throw new Error("Stops can only be added when ride is ongoing");
  //   }

  //   // add stop to meta.stops array
  //   ride.meta = ride.meta || {};
  //   ride.meta.stops = ride.meta.stops || [];
  //   const stopObj = {
  //     coordinates: stop.coordinates,
  //     address: stop.address || null,
  //     addedAt: new Date(),
  //   };
  //   ride.meta.stops.push(stopObj);
  //   // increment fare
  //   ride.fareUSD = Number(ride.fareUSD || 0) + Number(addedChargeUSD || 0);

  //   await ride.save();
  //   return ride.toObject ? ride.toObject() : ride;
  // }

  async addStopToRide({ userId, rideId, stop, addedChargeUSD = 5 }) {
    if (!rideId) throw new Error("rideId required");
    if (!userId) throw new Error("Unauthorized");
    if (
      !stop ||
      !Array.isArray(stop.coordinates) ||
      stop.coordinates.length !== 2
    ) {
      throw new Error("Invalid stop object (coordinates required)");
    }

    const ride = await RideRequestModel.findById(String(rideId));
    if (!ride) throw new Error("Ride not found");

    if (String(ride.userId) !== String(userId)) {
      throw new Error("Unauthorized: not the ride owner");
    }

    if (ride.status !== "ongoing") {
      throw new Error("Stops can only be added when ride is ongoing");
    }

    // ensure meta exists and is an object
    ride.meta = ride.meta || {};
    // ensure stops is an array
    if (!Array.isArray(ride.meta.stops)) ride.meta.stops = [];

    const stopObj = {
      coordinates: stop.coordinates.map(Number),
      address: stop.address || null,
      addedAt: new Date(),
    };
    ride.meta.stops.push(stopObj);

    // increment fare
    ride.fareUSD = Number(ride.fareUSD || 0) + Number(addedChargeUSD || 0);

    // <-- important for Mixed/plain Object fields
    ride.markModified("meta");

    await ride.save();

    try {
      if (ride.driverId) {
        await sendNotification(String(ride.driverId), {
          title: "New Stop Added",
          body: `Passenger added a new stop${
            stop.address ? `: ${stop.address}` : ""
          }`,
          senderId: userId,
          data: {
            rideId: String(ride._id),
            stop: stopObj,
            newFareUSD: ride.fareUSD,
            addedChargeUSD: addedChargeUSD,
          },
        });
      }
    } catch (notifErr) {
      // swallow notification errors to avoid breaking main flow, but log for debugging
      console.error("Error sending stop-added notification:", notifErr);
    }

    return ride.toObject ? ride.toObject() : ride;
  }

  /**
   * driverEndRide - driver ends ride: set status -> 'completed', append event, mark driver available,
   * clear currentRideId meta, emit final payload to user and ride room
   */
  async driverEndRide({
    driverId,
    rideId,
    endLocation,
    endTs = new Date(),
    finalFare = null,
  }) {
    if (!driverId || !rideId) {
      const e = new Error("driverId and rideId required");
      e.statusCode = 400;
      throw e;
    }

    // update ride to completed, optionally set final fare
    const updates = { completedAt: endTs };
    if (finalFare !== null) updates.fareUSD = finalFare;

    const updated = await rideRepo.updateStatus(rideId, "completed", updates);
    if (!updated) {
      const e = new Error("Ride not found or cannot end");
      e.statusCode = 400;
      throw e;
    }

    // append event
    await rideRepo.appendEvent(rideId, {
      type: "ride_completed",
      ts: endTs,
      data: { driverId, endLocation, finalFare },
    });

    // make driver available again and clear currentRideId
    const existing = liveDriverStore.get(driverId) || {};
    liveDriverStore.set(driverId, {
      coordinates: existing.coordinates || null,
      isAvailable: true,
      meta: Object.assign({}, existing.meta || {}, { currentRideId: null }),
    });

    // emit final status to user & ride room
    const payload = {
      status: true,
      message: "Ride completed successfully",
      data: {
        rideId: String(rideId),
        driverId: String(driverId),
        endLocation,
        completedAt: endTs,
        fareUSD: updated.fareUSD,
      },
    };

    this._emitToRideRoom(rideId, "ride:completed", payload);

    // --- SEND NOTIFICATION TO USER ---
    const ride = await RideRequestModel.findById(rideId).lean();
    if (ride && ride.userId) {
      await sendNotification(ride.userId, {
        title: "Ride Completed",
        body: `Your ride has been completed. Total fare: $${updated.fareUSD}`,
        senderId: driverId,
        data: {
          rideId: String(rideId),
          driverId: String(driverId),
          endLocation,
          completedAt: endTs,
          fareUSD: updated.fareUSD,
        },
      }).catch((err) => {
        console.error(
          "Error sending ride completed notification",
          ride.userId,
          err
        );
      });
    }

    // optionally emit to user private room too
    // this._emitToUser(updated.userId, "ride:completed", payload);

    // (payment flow will be triggered by client after this event)
    return updated;
  }

  /**
   * Create scheduled ride request and notify nearby live drivers
   * payload: { userId, rideType, vehicleType, date, time, from, to, radiusMiles?, maxDrivers? }
   * returns: { ride, notifiedDriversCount }
   */
  async sendScheduleRideRequestUsingLiveDrivers(payload = {}, options = {}) {
    const { userId, rideType, vehicleType, date, time, from, to } =
      payload || {};
    if (!userId) throw new Error("userId required");
    if (!rideType || rideType !== "schedule")
      throw new Error("rideType must be 'schedule'");
    if (!vehicleType) throw new Error("vehicleType required");
    if (
      !from ||
      !Array.isArray(from.coordinates) ||
      from.coordinates.length !== 2
    )
      throw new Error("Invalid from coordinates");
    if (!to || !Array.isArray(to.coordinates) || to.coordinates.length !== 2)
      throw new Error("Invalid to coordinates");
    if (!date || !time)
      throw new Error("date and time required for scheduled rides");

    // normalize coords to numbers [lng, lat]
    const fromCoords = from.coordinates.map(Number);
    const toCoords = to.coordinates.map(Number);

    // 1) compute distanceMiles using your haversine signature: haversineMiles([lng,lat], [lng,lat])
    const distanceMiles = this.haversineMiles
      ? this.haversineMiles(fromCoords, toCoords)
      : this._haversineMilesManual(fromCoords, toCoords);

    // 2) compute fare using your calculateFare signature: calculateFare(vehicleType, distanceMiles)
    const fareUSD = await this.calculateFare(vehicleType, distanceMiles);

    // 3) create RideRequest doc (store schedule info in meta.schedule)
    // const scheduledAt = new Date(`${date}T${time}`);
    // const rideDoc = await RideRequestModel.create({
    //   userId,
    //   driverId: null,
    //   rideType: "schedule",
    //   vehicleType,
    //   from: {
    //     type: "Point",
    //     coordinates: fromCoords,
    //     address: from.address || null,
    //   },
    //   to: {
    //     type: "Point",
    //     coordinates: toCoords,
    //     address: to.address || null,
    //   },
    //   distanceMiles,
    //   fareUSD,
    //   status: "pending",
    //   meta: {
    //     schedule: {
    //       date,
    //       time,
    //       scheduledAt,
    //     },
    //   },
    // });

    const scheduledAtUTC = moment
      .tz(`${date} ${time}`, payload.timezone || "Asia/Karachi")
      .utc()
      .toDate();
    const rideDoc = await RideRequestModel.create({
      userId,
      driverId: null,
      rideType: "schedule",
      vehicleType,
      from: {
        type: "Point",
        coordinates: fromCoords,
        address: from.address || null,
      },
      to: { type: "Point", coordinates: toCoords, address: to.address || null },
      distanceMiles,
      fareUSD,
      status: "pending",
      meta: {
        schedule: {
          date,
          time,
          timezone: payload.timezone || "Asia/Karachi",
          scheduledAt: scheduledAtUTC,
          notifications: {
            t_minus_60: false,
            t_minus_30: false,
            t_minus_5: false,
            at_time: false,
          },
        },
      },
    });

    // 4) find nearby live drivers based on fromCoords

    const config = await RideConfig.getConfig();
    const radiusMiles =
      Number(options.radiusMiles) || config.defaultRadiusMiles;
    const maxDrivers = Number(options.maxDrivers) || config.maxNotifyDrivers;
    const nearby = liveDriverStore.findWithinRadius(fromCoords, {
      radiusMiles,
      max: maxDrivers,
      haversineMiles: this.haversineMiles
        ? this.haversineMiles.bind(this)
        : undefined,
    });

    // fetch driver profiles (User model) to build driverSummary
    const driverIds = nearby.map((d) => d.driverId);
    let profilesMap = new Map();
    let vehiclesMap = new Map();
    if (driverIds.length) {
      const profiles = await User.find({ _id: { $in: driverIds } })
        .select("_id fullName profileImageKey createdAt")
        .lean();
      profilesMap = new Map(
        profiles.map((p) => {
          const profile = { ...p };
          const key = profile.profileImageKey || profile.profileImage || null;
          profile.profileImage = key ? this.buildProfileImage(key) : null;
          delete profile.profileImageKey;
          return [String(profile._id), profile];
        })
      );
      const vehicles = await Vehicle.find({ driver: { $in: driverIds } })
        .select("driver carMakeModel licensePlateNumber rideOption vehicleType")
        .lean();

      vehiclesMap = new Map(vehicles.map((v) => [String(v.driver), v]));
    }

    // fetch requesting user's profile once (for userName / userProfileImage)
    let requestingUser = null;
    try {
      requestingUser = await User.findById(userId)
        .select("_id fullName profileImageKey")
        .lean();
    } catch (e) {
      // ignore — userName will be null if not found
      requestingUser = null;
    }

    const userProfileImage = requestingUser?.profileImageKey
      ? this.buildProfileImage(requestingUser.profileImageKey)
      : null;

    // Filter nearby drivers by matching rideOption === requested vehicleType
    const eligibleDrivers = nearby.filter((d) => {
      const veh = vehiclesMap.get(d.driverId);
      // Only notify drivers that have a vehicle and whose rideOption strictly matches
      return veh && String(veh.rideOption) === String(vehicleType);
    });

    // 5) build the payload that drivers will receive and emit to each driver's room
    let notifiedDriversCount = 0;
    const io = require("../sockets/socket-manager").getIo();
    const createdAt = rideDoc.createdAt || new Date();

    for (const d of eligibleDrivers) {
      const driverId = d.driverId;
      const driverProfile = profilesMap.get(driverId) || null;
      const vehicle = vehiclesMap.get(driverId) || null;

      // calculate distance from driver to pickup using your haversine signature
      const distanceFromDriverMiles = this.haversineMiles
        ? this.haversineMiles(d.coordinates, fromCoords)
        : this._haversineMilesManual(d.coordinates, fromCoords);

      const driverPayload = {
        status: true,
        message: "You have a new schedule ride request",
        data: {
          rideId: String(rideDoc._id),
          userId: String(rideDoc.userId),
          userName: requestingUser ? requestingUser.fullName : null,
          userProfileImage: userProfileImage,
          rideType: "schedule",
          vehicleType: rideDoc.vehicleType,
          fareUSD: Number(fareUSD),
          distanceMiles: Number(distanceMiles),
          distanceFromDriverMiles: Number(distanceFromDriverMiles),
          schduleDate: rideDoc.meta.schedule.date,
          schduleTime: rideDoc.meta.schedule.time,
          from: {
            type: "Point",
            coordinates: rideDoc.from.coordinates,
            address: rideDoc.from.address || null,
          },
          to: {
            type: "Point",
            coordinates: rideDoc.to.coordinates,
            address: rideDoc.to.address || null,
          },
          driverSummary: driverProfile
            ? {
                id: String(driverProfile._id),
                name: driverProfile.fullName || null,
                profileImage: driverProfile.profileImage || null,
                memberSince: driverProfile.createdAt
                  ? driverProfile.createdAt.toISOString()
                  : null,
              }
            : null,
          vehicleSummary: vehicle
            ? {
                carMakeModel: vehicle.carMakeModel || null,
                licensePlateNumber: vehicle.licensePlateNumber || null,
                rideOption: vehicle.rideOption || null,
                vehicleType: vehicle.vehicleType || null,
              }
            : null,
          createdAt: createdAt.toISOString(),
        },
      };

      if (io) {
        io.to(`driver:${driverId}`).emit(
          "ride:schedule_request",
          driverPayload
        );
        notifiedDriversCount++;
      }

      // send push / in-app notification to driver (fire-and-forget; logs errors)
      await sendNotification(driverId, {
        title: "New Schedule Ride Request",
        body: `You have a new scheduled ride request${
          requestingUser?.fullName ? ` from ${requestingUser.fullName}` : ""
        }`,
        senderId: userId,
        data: {
          rideId: String(rideDoc._id),
          userId: String(rideDoc.userId),
          rideType: "schedule",
          vehicleType: rideDoc.vehicleType,
          fareUSD: Number(fareUSD),
          distanceMiles: Number(distanceMiles),
          distanceFromDriverMiles: Number(distanceFromDriverMiles),
          scheduleDate: rideDoc.meta.schedule.date,
          scheduleTime: rideDoc.meta.schedule.time,
          from: {
            type: "Point",
            coordinates: rideDoc.from.coordinates,
            address: rideDoc.from.address || null,
          },
          to: {
            type: "Point",
            coordinates: rideDoc.to.coordinates,
            address: rideDoc.to.address || null,
          },
        },
      }).catch((err) => {
        console.error(
          "Error sending schedule notification to driver",
          driverId,
          err
        );
      });
    }

    return {
      ride: rideDoc.toObject ? rideDoc.toObject() : rideDoc,
      notifiedDriversCount,
    };
  }
  /**
   * payload: {
   *   userId,
   *   vehicleType,
   *   rideType, // 'courier-food' | 'courier-package'
   *   from: { coordinates: [lng, lat], address? },
   *   to:   { coordinates: [lng, lat], address? },
   *   receiverFullName, // required for courier-food usually
   *   receiverContact
   * }
   *
   * options: { radiusMiles?, maxDrivers? }
   */
  async sendFoodDeliveryRequestUsingLiveDrivers(payload = {}, options = {}) {
    const {
      userId,
      vehicleType,
      rideType,
      from,
      to,
      receiverFullName,
      receiverContact,
    } = payload || {};

    if (!userId) throw new Error("userId required");
    if (!vehicleType) throw new Error("vehicleType required");
    if (!rideType || !["courier-food", "courier-package"].includes(rideType))
      throw new Error("rideType must be 'courier-food' or 'courier-package'");

    if (
      !from ||
      !Array.isArray(from.coordinates) ||
      from.coordinates.length !== 2
    )
      throw new Error("Invalid from coordinates");
    if (!to || !Array.isArray(to.coordinates) || to.coordinates.length !== 2)
      throw new Error("Invalid to coordinates");

    // normalize coords
    const fromCoords = from.coordinates.map(Number);
    const toCoords = to.coordinates.map(Number);

    // compute distance using your haversine signature ([lng,lat], [lng,lat])
    const distanceMiles = this.haversineMiles
      ? this.haversineMiles(fromCoords, toCoords)
      : this._haversineMilesManual(fromCoords, toCoords);

    // compute base fare using your signature calculateFare(vehicleType, distanceMiles)
    const baseFare = await this.calculateFare(vehicleType, distanceMiles);

    // courier-food surcharge (fixed)
    // const fareFoodUSD = rideType === "courier-food" ? 10 : 0;

    const config = await RideConfig.getConfig();
    const fareFoodUSD = config.courierFoodRate;

    // total fare
    const totalFare = Number(
      (Number(baseFare || 0) + Number(fareFoodUSD)).toFixed(2)
    );

    // create RideRequest doc with status pending
    const rideDoc = await RideRequestModel.create({
      userId,
      driverId: null,
      rideType,
      vehicleType,
      from: {
        type: "Point",
        coordinates: fromCoords,
        address: from.address || null,
      },
      to: { type: "Point", coordinates: toCoords, address: to.address || null },
      distanceMiles,
      fareUSD: totalFare,
      fareFoodUSD: fareFoodUSD,
      status: "pending",
      meta: {
        delivery: {
          receiverFullName: receiverFullName || null,
          receiverContact: receiverContact || null,
        },
      },
    });

    // find nearby live drivers
    const radiusMiles =
      Number(options.radiusMiles) || config.defaultRadiusMiles;
    const maxDrivers = Number(options.maxDrivers) || config.maxNotifyDrivers;

    const nearby = liveDriverStore.findWithinRadius(fromCoords, {
      radiusMiles,
      max: maxDrivers,
      haversineMiles: this.haversineMiles
        ? this.haversineMiles.bind(this)
        : undefined,
    });

    // fetch driver profiles (User model) to build driverSummary
    const driverIds = nearby.map((d) => d.driverId);
    let profilesMap = new Map();
    let vehiclesMap = new Map();
    if (driverIds.length) {
      const profiles = await User.find({ _id: { $in: driverIds } })
        .select("_id fullName profileImageKey createdAt")
        .lean();
      profilesMap = new Map(
        profiles.map((p) => {
          const profile = { ...p };
          const key = profile.profileImageKey || profile.profileImage || null;
          profile.profileImage = key ? this.buildProfileImage(key) : null;
          delete profile.profileImageKey;
          return [String(profile._id), profile];
        })
      );
      const vehicles = await Vehicle.find({ driver: { $in: driverIds } })
        .select("driver carMakeModel licensePlateNumber rideOption vehicleType")
        .lean();

      vehiclesMap = new Map(vehicles.map((v) => [String(v.driver), v]));
    }

    // fetch requesting user's profile once (for userName / userProfileImage)
    let requestingUser = null;
    try {
      requestingUser = await User.findById(userId)
        .select("_id fullName profileImageKey")
        .lean();
    } catch (e) {
      // ignore — userName will be null if not found
      requestingUser = null;
    }

    const userProfileImage = requestingUser?.profileImageKey
      ? this.buildProfileImage(requestingUser.profileImageKey)
      : null;

    // Filter nearby drivers by matching rideOption === requested vehicleType
    const eligibleDrivers = nearby.filter((d) => {
      const veh = vehiclesMap.get(d.driverId);
      // Only notify drivers that have a vehicle and whose rideOption strictly matches
      return veh && String(veh.rideOption) === String(vehicleType);
    });

    // build & emit payload to each nearby driver
    let notifiedDriversCount = 0;
    const io = require("../sockets/socket-manager").getIo();
    const createdAt = rideDoc.createdAt || new Date();

    for (const d of eligibleDrivers) {
      const driverId = d.driverId;
      const driverProfile = profilesMap.get(driverId) || null;
      const vehicle = vehiclesMap.get(driverId) || null;

      const distanceFromDriverMiles = this.haversineMiles
        ? this.haversineMiles(d.coordinates, fromCoords)
        : this._haversineMilesManual(d.coordinates, fromCoords);

      const driverPayload = {
        status: true,
        message: "You have a new courier food delivery ride request",
        data: {
          rideId: String(rideDoc._id),
          userId: String(rideDoc.userId),
          userName: requestingUser ? requestingUser.fullName : null,
          userProfileImage: userProfileImage,
          receiverFullName: receiverFullName || null,
          receiverContact: receiverContact || null,
          rideType,
          vehicleType: rideDoc.vehicleType,
          fareUSD: Number(totalFare),
          fareFoodUSD: Number(fareFoodUSD),
          distanceMiles: Number(distanceMiles),
          distanceFromDriverMiles: Number(distanceFromDriverMiles),
          from: {
            type: "Point",
            coordinates: rideDoc.from.coordinates,
            address: rideDoc.from.address || null,
          },
          to: {
            type: "Point",
            coordinates: rideDoc.to.coordinates,
            address: rideDoc.to.address || null,
          },
          driverSummary: driverProfile
            ? {
                id: String(driverProfile._id),
                name: driverProfile.fullName || null,
                profileImage: driverProfile.profileImage || null,
                memberSince: driverProfile.createdAt
                  ? driverProfile.createdAt.toISOString()
                  : null,
              }
            : null,
          vehicleSummary: vehicle
            ? {
                carMakeModel: vehicle.carMakeModel || null,
                licensePlateNumber: vehicle.licensePlateNumber || null,
                rideOption: vehicle.rideOption || null,
                vehicleType: vehicle.vehicleType || null,
              }
            : null,
          createdAt: createdAt.toISOString(),
        },
      };

      if (io) {
        // emit the same event name you use for instant requests (so accept/ongoing flows remain unchanged).
        // If your instant flow uses a specific event, make that match here. I'm using "ride:instant_request".
        io.to(`driver:${driverId}`).emit(
          "ride:courier_food_request",
          driverPayload
        );
        notifiedDriversCount++;
      }

      await sendNotification(driverId, {
        title: "New Courier Food Delivery Request",
        body: `You have a new courier food delivery request${
          requestingUser?.fullName ? ` from ${requestingUser.fullName}` : ""
        }`,
        senderId: userId,
        data: {
          rideId: String(rideDoc._id),
          userId: String(rideDoc.userId),
          rideType,
          vehicleType: rideDoc.vehicleType,
          fareUSD: Number(totalFare),
          fareFoodUSD: Number(fareFoodUSD),
          distanceMiles: Number(distanceMiles),
          distanceFromDriverMiles: Number(distanceFromDriverMiles),
          scheduleCreatedAt: createdAt.toISOString
            ? createdAt.toISOString()
            : String(createdAt),
          from: {
            type: "Point",
            coordinates: rideDoc.from.coordinates,
            address: rideDoc.from.address || null,
          },
          to: {
            type: "Point",
            coordinates: rideDoc.to.coordinates,
            address: rideDoc.to.address || null,
          },
        },
      }).catch((err) => {
        console.error(
          "Error sending courier food delivery notification to driver",
          driverId,
          err
        );
      });
    }

    return {
      ride: rideDoc.toObject ? rideDoc.toObject() : rideDoc,
      notifiedDriversCount,
    };
  }

  async sendPackageDeliveryRequestUsingLiveDrivers(payload = {}, options = {}) {
    const {
      userId,
      vehicleType,
      rideType, // expected "courier-package"
      from,
      to,
      receiverFullName,
      receiverContact,
      specialInstructions,
      numberOfPackages,
      packageWeights, // [lbs]
      packageVolums, // [in^3]
    } = payload || {};

    // validation
    if (!userId) throw new Error("userId required");
    if (!vehicleType) throw new Error("vehicleType required");
    if (rideType !== "courier-package")
      throw new Error("rideType must be 'courier-package'");
    if (
      !from ||
      !Array.isArray(from.coordinates) ||
      from.coordinates.length !== 2
    )
      throw new Error("Invalid from coordinates");
    if (!to || !Array.isArray(to.coordinates) || to.coordinates.length !== 2)
      throw new Error("Invalid to coordinates");
    const noOfPackages =
      Number(numberOfPackages) ||
      (Array.isArray(packageWeights) ? packageWeights.length : 0);
    if (noOfPackages <= 0)
      throw new Error("numberOfPackages required and must be > 0");
    if (
      !Array.isArray(packageWeights) ||
      packageWeights.length !== noOfPackages
    )
      throw new Error(
        "packageWeights must be an array of length numberOfPackages"
      );
    if (!Array.isArray(packageVolums) || packageVolums.length !== noOfPackages)
      throw new Error(
        "packageVolums must be an array of length numberOfPackages"
      );

    // normalize coords
    const fromCoords = from.coordinates.map(Number);
    const toCoords = to.coordinates.map(Number);

    // compute distance using your haversine signature
    const distanceMiles = this.haversineMiles
      ? this.haversineMiles(fromCoords, toCoords)
      : this._haversineMilesManual(fromCoords, toCoords);

    // Pricing constants (per your instruction)
    const divisor = 166; // volumetric divisor (in^3 -> lb)
    const ratePerLb = 3; // $ per lb
    const pickupFee = 5; // $ per pickup (per package formula uses pickupFee then per-lb)
    const minimumCharge = 10; // minimum charge per package (you can change)

    // compute per-package fares
    const packageDetails = []; // store computed details
    let aggregatePackageFare = 0;

    for (let i = 0; i < noOfPackages; ++i) {
      const actualWeightLb = Number(packageWeights[i]) || 0;
      const volumetricWeightLb = Number(packageVolums[i]) / divisor; // in lbs
      const billableWeight = Math.max(actualWeightLb, volumetricWeightLb);
      const roundedBillableWeight = Math.ceil(billableWeight);
      let fare =
        Number(pickupFee) + Number(roundedBillableWeight) * Number(ratePerLb);
      if (fare < minimumCharge) fare = minimumCharge;
      fare = Math.round((fare + Number.EPSILON) * 100) / 100;

      packageDetails.push({
        index: i,
        actualWeightLb,
        volumetricWeightLb: Number(volumetricWeightLb.toFixed(4)),
        billableWeight: roundedBillableWeight,
        fare,
      });

      aggregatePackageFare += fare;
    }

    aggregatePackageFare =
      Math.round((aggregatePackageFare + Number.EPSILON) * 100) / 100;

    // base fare for distance if you still want to add distance component (your formula uses only packages)
    // According to your formula totalFare = sum(fare for each package) — so no extra distance fare here.
    const farePackageUSD = aggregatePackageFare;
    const totalFare = farePackageUSD; // keep total as package sum; if you want add base distance fare, modify here

    // create RideRequest doc with status pending and meta.package details
    const rideDoc = await RideRequestModel.create({
      userId,
      driverId: null,
      rideType: "courier-package",
      vehicleType,
      from: {
        type: "Point",
        coordinates: fromCoords,
        address: from.address || null,
      },
      to: { type: "Point", coordinates: toCoords, address: to.address || null },
      distanceMiles,
      fareUSD: totalFare,
      farePackageUSD: farePackageUSD,
      status: "pending",
      meta: {
        deliveryPackage: {
          receiverFullName: receiverFullName || null,
          receiverContact: receiverContact || null,
          specialInstructions: specialInstructions || null,
          numberOfPackages: noOfPackages,
          packageWeights: packageWeights.map((w) => Number(w)),
          packageVolums: packageVolums.map((v) => Number(v)),
          packageDetails, // computed per-package breakdown
        },
      },
    });

    // find nearby drivers

    const config = await RideConfig.getConfig();
    const radiusMiles =
      Number(options.radiusMiles) || config.defaultRadiusMiles;
    const maxDrivers = Number(options.maxDrivers) || config.maxNotifyDrivers;

    const nearby = liveDriverStore.findWithinRadius(fromCoords, {
      radiusMiles,
      max: maxDrivers,
      haversineMiles: this.haversineMiles
        ? this.haversineMiles.bind(this)
        : undefined,
    });

    // // fetch driver profiles in batch
    // const driverIds = nearby.map((d) => d.driverId);
    // let profilesMap = new Map();
    // if (driverIds.length) {
    //   const profiles = await User.find({ _id: { $in: driverIds } })
    //     .select("_id fullName profileImage createdAt")
    //     .lean();
    //   profilesMap = new Map(profiles.map((p) => [String(p._id), p]));
    // }

    // // fetch requesting user's profile once
    // let requestingUser = null;
    // try {
    //   requestingUser = await User.findById(userId)
    //     .select("_id fullName profileImage")
    //     .lean();
    // } catch (e) {
    //   requestingUser = null;
    // }

    // fetch driver profiles (User model) to build driverSummary
    const driverIds = nearby.map((d) => d.driverId);
    let profilesMap = new Map();
    let vehiclesMap = new Map();
    if (driverIds.length) {
      const profiles = await User.find({ _id: { $in: driverIds } })
        .select("_id fullName profileImageKey createdAt")
        .lean();
      profilesMap = new Map(
        profiles.map((p) => {
          const profile = { ...p };
          const key = profile.profileImageKey || profile.profileImage || null;
          profile.profileImage = key ? this.buildProfileImage(key) : null;
          delete profile.profileImageKey;
          return [String(profile._id), profile];
        })
      );
      const vehicles = await Vehicle.find({ driver: { $in: driverIds } })
        .select("driver carMakeModel licensePlateNumber rideOption vehicleType")
        .lean();

      vehiclesMap = new Map(vehicles.map((v) => [String(v.driver), v]));
    }

    // fetch requesting user's profile once (for userName / userProfileImage)
    let requestingUser = null;
    try {
      requestingUser = await User.findById(userId)
        .select("_id fullName profileImageKey")
        .lean();
    } catch (e) {
      // ignore — userName will be null if not found
      requestingUser = null;
    }

    const userProfileImage = requestingUser?.profileImageKey
      ? this.buildProfileImage(requestingUser.profileImageKey)
      : null;

    // Filter nearby drivers by matching rideOption === requested vehicleType
    const eligibleDrivers = nearby.filter((d) => {
      const veh = vehiclesMap.get(d.driverId);
      // Only notify drivers that have a vehicle and whose rideOption strictly matches
      return veh && String(veh.rideOption) === String(vehicleType);
    });

    // build & emit payload to drivers (use same event as instant flow)
    let notifiedDriversCount = 0;
    const io = socketManager.getIo();
    const createdAt = rideDoc.createdAt || new Date();

    for (const d of eligibleDrivers) {
      const driverId = d.driverId;
      const driverProfile = profilesMap.get(driverId) || null;
      const vehicle = vehiclesMap.get(driverId) || null;

      const distanceFromDriverMiles = this.haversineMiles
        ? this.haversineMiles(d.coordinates, fromCoords)
        : this._haversineMilesManual(d.coordinates, fromCoords);

      const driverPayload = {
        status: true,
        message: "You have a new courier package delivery ride request",
        data: {
          rideId: String(rideDoc._id),
          userId: String(rideDoc.userId),
          userName: requestingUser ? requestingUser.fullName : null,
          userProfileImage: userProfileImage,
          receiverFullName: receiverFullName || null,
          receiverContact: receiverContact || null,
          specialInstructions: specialInstructions || null,
          rideType: "courier-package",
          vehicleType: rideDoc.vehicleType,
          fareUSD: Number(totalFare),
          farePackageUSD: Number(farePackageUSD),
          distanceMiles: Number(distanceMiles),
          distanceFromDriverMiles: Number(distanceFromDriverMiles),
          noOfPackages: noOfPackages,
          packageWeights: packageWeights.map((w) => Number(w)),
          packageVolums: packageVolums.map((v) => Number(v)),
          packageDetails, // per-package breakdown (optional)
          from: {
            type: "Point",
            coordinates: rideDoc.from.coordinates,
            address: rideDoc.from.address || null,
          },
          to: {
            type: "Point",
            coordinates: rideDoc.to.coordinates,
            address: rideDoc.to.address || null,
          },
          driverSummary: driverProfile
            ? {
                id: String(driverProfile._id),
                name: driverProfile.fullName || null,
                profileImage: driverProfile.profileImage || null,
                memberSince: driverProfile.createdAt
                  ? driverProfile.createdAt.toISOString()
                  : null,
              }
            : null,
          vehicleSummary: vehicle
            ? {
                carMakeModel: vehicle.carMakeModel || null,
                licensePlateNumber: vehicle.licensePlateNumber || null,
                rideOption: vehicle.rideOption || null,
                vehicleType: vehicle.vehicleType || null,
              }
            : null,
          createdAt: createdAt.toISOString(),
        },
      };

      if (io) {
        // emit the same event used for instant ride offers so driver-side code works unchanged
        io.to(`driver:${driverId}`).emit(
          "ride:courier_package_request",
          driverPayload
        );
        notifiedDriversCount++;
      }

      // send push / in-app notification to driver (fire-and-forget)
      sendNotification(driverId, {
        title: "New Courier Package Delivery Request",
        body: `You have a new courier package delivery request${
          requestingUser?.fullName ? ` from ${requestingUser.fullName}` : ""
        }`,
        senderId: userId,
        data: {
          rideId: String(rideDoc._id),
          userId: String(rideDoc.userId),
          rideType: "courier-package",
          vehicleType: rideDoc.vehicleType,
          fareUSD: Number(totalFare),
          farePackageUSD: Number(farePackageUSD),
          distanceMiles: Number(distanceMiles),
          distanceFromDriverMiles: Number(distanceFromDriverMiles),
          noOfPackages: noOfPackages,
          packageWeights: packageWeights.map((w) => Number(w)),
          packageVolums: packageVolums.map((v) => Number(v)),
          packageDetails, // will be JSON-stringified by sendNotification
          from: {
            type: "Point",
            coordinates: rideDoc.from.coordinates,
            address: rideDoc.from.address || null,
          },
          to: {
            type: "Point",
            coordinates: rideDoc.to.coordinates,
            address: rideDoc.to.address || null,
          },
        },
      }).catch((err) => {
        console.error(
          "Error sending courier package notification to driver",
          driverId,
          err
        );
      });
    }

    return {
      ride: rideDoc.toObject ? rideDoc.toObject() : rideDoc,
      notifiedDriversCount,
    };
  }

  // Get apis code
  // async getScheduleRidesByUser({ userId }) {
  //   const rides = await RideRequestModel.find({
  //     userId,
  //     rideType: "schedule",
  //     status: { $in: ["accepted", "completed"] },
  //   }).sort({ createdAt: -1 });

  //   const accepted = rides.filter((r) => r.status === "accepted");
  //   const completed = rides.filter((r) => r.status === "completed");

  //   return { accepted, completed };
  // }

  async getScheduleRidesByUser({ userId }) {
    if (!userId) throw { statusCode: 400, message: "userId is required" };

    // 1) Fetch scheduled rides for the user
    const rides = await RideRequestModel.find({
      userId,
      rideType: "schedule",
      status: { $in: ["accepted", "completed"] },
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!rides || rides.length === 0) {
      return { accepted: [], completed: [] };
    }

    // 2) Collect unique driverIds
    const driverIdSet = new Set();
    for (const r of rides) {
      if (r.driverId) driverIdSet.add(r.driverId); // keep as string
    }
    const driverIds = Array.from(driverIdSet);

    // 3) Aggregate reviews (average rating & total) by driverId
    let ratingsAgg = [];
    if (driverIds.length > 0) {
      ratingsAgg = await Review.aggregate([
        { $match: { driverId: { $in: driverIds } } }, // driverId as string
        {
          $group: {
            _id: "$driverId",
            averageRating: { $avg: "$rating" },
            totalReviews: { $sum: 1 },
          },
        },
      ]);
    }

    const ratingsMap = {};
    for (const a of ratingsAgg) {
      ratingsMap[a._id] = {
        averageRating: Number(a.averageRating.toFixed(2)),
        totalReviews: a.totalReviews,
      };
    }

    // 4) Load driver user data in one query
    const users =
      driverIds.length > 0
        ? await User.find({ _id: { $in: driverIds } })
            .select("fullName profileImageKey")
            .lean()
        : [];

    const usersMap = {};
    for (const u of users) {
      usersMap[u._id] = {
        _id: u._id,
        fullName: u.fullName,
        profileImageUrl: this.buildProfileImage(u.profileImageKey),
      };
    }

    // 5) Attach driver object to each ride
    const enriched = rides.map((r) => {
      const drvId = r.driverId || null;
      const ratingObj =
        drvId && ratingsMap[drvId]
          ? ratingsMap[drvId]
          : { averageRating: 0, totalReviews: 0 };
      const userObj = drvId && usersMap[drvId] ? usersMap[drvId] : null;

      const driver = drvId
        ? {
            _id: drvId,
            fullName: userObj ? userObj.fullName : null,
            profileImageUrl: userObj ? userObj.profileImageUrl : null,
            averageRating: ratingObj.averageRating,
            totalReviews: ratingObj.totalReviews,
          }
        : null;

      return {
        ...r,
        driver,
      };
    });

    // 6) Split accepted & completed rides
    const accepted = enriched.filter((i) => i.status === "accepted");
    const completed = enriched.filter((i) => i.status === "completed");

    return { accepted, completed };
  }

  async getScheduleRidesByDriver({ driverId }) {
    const rides = await RideRequestModel.find({
      driverId,
      rideType: "schedule",
      status: { $in: ["accepted", "completed"] },
    })
      .populate({
        path: "userId",
        select: "fullName profileImageKey", // only include needed fields
      })
      .sort({ createdAt: -1 });

    const result = rides.map((ride) => {
      // convert to plain object once
      const obj = ride.toObject();

      // build the minimal user object (or null)
      const user = ride.userId
        ? {
            id: String(ride.userId._id),
            fullName: ride.userId.fullName || null,
            profileImage: this.buildProfileImage(ride.userId.profileImageKey),
          }
        : null;

      // remove the populated userId so we don't return both userId and user
      delete obj.userId;

      // return the ride object with the new `user` field
      return { ...obj, user };
    });

    const accepted = result.filter((r) => r.status === "accepted");
    const completed = result.filter((r) => r.status === "completed");

    return { accepted, completed };
  }

  // async getFoodDeliveryHistoryForUser({ userId }) {
  //   const rides = await RideRequestModel.find({
  //     userId,
  //     rideType: { $in: ["courier-food", "courier-package"] },
  //     status: { $in: ["completed", "cancelled"] },
  //   }).sort({ createdAt: -1 });

  //   const completed = rides.filter((r) => r.status === "completed");
  //   const cancelled = rides.filter((r) => r.status === "cancelled");

  //   return { completed, cancelled };
  // }

  /**
   * Return food delivery history for user with driver object attached for each ride.
   * driver object includes: _id, fullName, profileImageUrl, averageRating, totalReviews
   */
  async getFoodDeliveryHistoryForUser({ userId }) {
    if (!userId) throw { statusCode: 400, message: "userId is required" };

    // 1) Fetch rides
    const rides = await RideRequestModel.find({
      userId,
      rideType: { $in: ["courier-food", "courier-package"] },
      status: { $in: ["completed", "cancelled"] },
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!rides || rides.length === 0) {
      return { completed: [], cancelled: [] };
    }

    // 2) Collect unique driverIds
    const driverIdSet = new Set();
    for (const r of rides) {
      if (r.driverId) driverIdSet.add(r.driverId); // keep as string
    }
    const driverIds = Array.from(driverIdSet);

    // 3) Aggregate reviews (average rating & total) by driverId
    let ratingsAgg = [];
    if (driverIds.length > 0) {
      ratingsAgg = await Review.aggregate([
        { $match: { driverId: { $in: driverIds } } }, // driverId as string
        {
          $group: {
            _id: "$driverId",
            averageRating: { $avg: "$rating" },
            totalReviews: { $sum: 1 },
          },
        },
      ]);
    }

    const ratingsMap = {};
    for (const a of ratingsAgg) {
      ratingsMap[a._id] = {
        averageRating: Number(a.averageRating.toFixed(2)),
        totalReviews: a.totalReviews,
      };
    }

    // 4) Load driver user data in one query
    const users =
      driverIds.length > 0
        ? await User.find({ _id: { $in: driverIds } })
            .select("fullName profileImageKey")
            .lean()
        : [];

    const usersMap = {};
    for (const u of users) {
      usersMap[u._id] = {
        _id: u._id,
        fullName: u.fullName,
        profileImageUrl: this.buildProfileImage(u.profileImageKey),
      };
    }

    // 5) Attach driver object to each ride
    const enriched = rides.map((r) => {
      const drvId = r.driverId || null;
      const ratingObj =
        drvId && ratingsMap[drvId]
          ? ratingsMap[drvId]
          : { averageRating: 0, totalReviews: 0 };
      const userObj = drvId && usersMap[drvId] ? usersMap[drvId] : null;

      const driver = drvId
        ? {
            _id: drvId,
            fullName: userObj ? userObj.fullName : null,
            profileImageUrl: userObj ? userObj.profileImageUrl : null,
            averageRating: ratingObj.averageRating,
            totalReviews: ratingObj.totalReviews,
          }
        : null;

      return {
        ...r,
        driver,
      };
    });

    // 6) Split completed & cancelled
    const completed = enriched.filter((i) => i.status === "completed");
    const cancelled = enriched.filter((i) => i.status === "cancelled");

    return { completed, cancelled };
  }

  // async getUserRideHistory({ userId }) {
  //   const rides = await RideRequestModel.find({
  //     userId,
  //     rideType: "instant",
  //     status: { $in: ["completed", "cancelled"] },
  //   }).sort({ createdAt: -1 });

  //   const completed = rides.filter((r) => r.status === "completed");
  //   const cancelled = rides.filter((r) => r.status === "cancelled");

  //   return { completed, cancelled };
  // }

  async getUserRideHistory({ userId }) {
    if (!userId) throw { statusCode: 400, message: "userId is required" };

    // 1) Fetch user rides of type "instant"
    const rides = await RideRequestModel.find({
      userId,
      rideType: "instant",
      status: { $in: ["completed", "cancelled"] },
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!rides || rides.length === 0) {
      return { completed: [], cancelled: [] };
    }

    // 2) Collect unique driverIds
    const driverIdSet = new Set();
    for (const r of rides) {
      if (r.driverId) driverIdSet.add(r.driverId); // keep as string
    }
    const driverIds = Array.from(driverIdSet);

    // 3) Aggregate reviews (average rating & total) by driverId
    let ratingsAgg = [];
    if (driverIds.length > 0) {
      ratingsAgg = await Review.aggregate([
        { $match: { driverId: { $in: driverIds } } },
        {
          $group: {
            _id: "$driverId",
            averageRating: { $avg: "$rating" },
            totalReviews: { $sum: 1 },
          },
        },
      ]);
    }

    const ratingsMap = {};
    for (const a of ratingsAgg) {
      ratingsMap[a._id] = {
        averageRating: Number(a.averageRating.toFixed(2)),
        totalReviews: a.totalReviews,
      };
    }

    // 4) Load driver user data
    const users =
      driverIds.length > 0
        ? await User.find({ _id: { $in: driverIds } })
            .select("fullName profileImageKey")
            .lean()
        : [];

    const usersMap = {};
    for (const u of users) {
      usersMap[u._id] = {
        _id: u._id,
        fullName: u.fullName,
        profileImageUrl: this.buildProfileImage(u.profileImageKey),
      };
    }

    // 5) Attach driver object to each ride
    const enriched = rides.map((r) => {
      const drvId = r.driverId || null;
      const ratingObj =
        drvId && ratingsMap[drvId]
          ? ratingsMap[drvId]
          : { averageRating: 0, totalReviews: 0 };
      const userObj = drvId && usersMap[drvId] ? usersMap[drvId] : null;

      const driver = drvId
        ? {
            _id: drvId,
            fullName: userObj ? userObj.fullName : null,
            profileImageUrl: userObj ? userObj.profileImageUrl : null,
            averageRating: ratingObj.averageRating,
            totalReviews: ratingObj.totalReviews,
          }
        : null;

      return {
        ...r,
        driver,
      };
    });

    // 6) Split completed & cancelled rides
    const completed = enriched.filter((i) => i.status === "completed");
    const cancelled = enriched.filter((i) => i.status === "cancelled");

    return { completed, cancelled };
  }

  async getDriverRideHistory({ driverId }) {
    const rides = await RideRequestModel.find({
      driverId,
      rideType: { $in: ["instant", "courier-food", "courier-package"] },
      status: "completed",
    }).sort({ createdAt: -1 });

    const ridesArray = rides.filter((r) => r.rideType === "instant");
    const foodDeliveries = rides.filter(
      (r) => r.rideType === "courier-food" || r.rideType === "courier-package"
    );

    return {
      rides: ridesArray,
      foodDeliveries,
    };
  }

  async getRecentPlaces({ userId }) {
    if (!userId) throw { statusCode: 400, message: "User ID is required" };

    // Fetch user coordinates
    const user = await User.findById(userId).select("location").lean();
    const userCoords = user?.location?.coordinates || null;

    // Get latest 10 rides
    const rides = await RideRequestModel.find({ userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .select("to createdAt")
      .lean();

    const seen = new Set();
    const recentPlaces = [];

    for (const r of rides) {
      if (!r.to || !r.to.coordinates) continue;
      const key = r.to.coordinates.join(",");
      if (seen.has(key)) continue;
      seen.add(key);

      let distanceMiles = null;
      if (userCoords) {
        distanceMiles = this.haversineMiles(userCoords, r.to.coordinates);
      }

      recentPlaces.push({
        address: r.to.address || null,
        coordinates: r.to.coordinates,
        rideAt: r.createdAt,
        distance:
          distanceMiles !== null ? `${distanceMiles.toFixed(2)} miles` : null,
      });

      if (recentPlaces.length >= this.maxRecent) break;
    }

    return recentPlaces;
  }
}

module.exports = RideService;
