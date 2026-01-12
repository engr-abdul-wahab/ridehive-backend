// src/sockets/handlers/user-handler.js
// Handles user socket events: drivers:nearby and ride:send_request
// Expects: socket.user populated by authSocket middleware (contains _id and role)

const liveDriverStore = require("../../stores/live-driver-store");
const liveUserStore = require("../../stores/live-user-store");
const RideService = require("../../service/ride-service");
const User = require("../../models/User");
const RideConfig = require("../../models/RideConfig");

const rideService = new RideService();

exports.register = (socket, io) => {
  const userId =
    socket.user && socket.user._id ? String(socket.user._id) : null;

  // For calculate fare
  // socket.on("fare:estimate", (payload = {}, ack) => {
  //   try {
  //     const userId = socket.user?._id;
  //     if (!userId)
  //       return socket.emit("fare:error", {
  //         status: false,
  //         message: "Unauthorized",
  //       });

  //     const { from, to, vehicleType, rideType } = payload || {};

  //     // validate vehicleType
  //     if (!vehicleType || typeof vehicleType !== "string") {
  //       const err = {
  //         status: false,
  //         message: "vehicleType is required and must be a string",
  //       };
  //       // if (typeof ack === "function") return ack(err);
  //       return socket.emit("fare:error", err);
  //     }

  //     // validate from/to coordinates - expect: { coordinates: [lng, lat] }
  //     if (
  //       !from ||
  //       !Array.isArray(from.coordinates) ||
  //       from.coordinates.length !== 2 ||
  //       from.coordinates.some((c) => Number.isNaN(Number(c)))
  //     ) {
  //       const err = { status: false, message: "Invalid 'from' coordinates" };
  //       // if (typeof ack === "function") return ack(err);
  //       return socket.emit("fare:error", err);
  //     }

  //     if (
  //       !to ||
  //       !Array.isArray(to.coordinates) ||
  //       to.coordinates.length !== 2 ||
  //       to.coordinates.some((c) => Number.isNaN(Number(c)))
  //     ) {
  //       const err = { status: false, message: "Invalid 'to' coordinates" };
  //       // if (typeof ack === "function") return ack(err);
  //       return socket.emit("fare:error", err);
  //     }

  //     // normalize numbers
  //     const fromCoords = from.coordinates.map(Number);
  //     const toCoords = to.coordinates.map(Number);

  //     // compute distance using your RideService haversineMiles
  //     const distanceMilesRaw = rideService.haversineMiles(fromCoords, toCoords);

  //     // compute fare using your calculateFare(vehicleType, distanceMiles)
  //     const fareRaw = rideService.calculateFare(vehicleType, distanceMilesRaw);

  //     if(rideType === "instant"){
  //       const totalFare = fareRaw;
  //     }

  //     if (rideType === "courier-food") {
  //       // courier-food surcharge (fixed)
  //       const fareFoodUSD = rideType === "courier-food" ? 10 : 0;

  //       // total fare
  //       const totalFare = Number(
  //         (Number(baseFare || 0) + Number(fareFoodUSD)).toFixed(2)
  //       );
  //     }

  //     if (rideType === "courier-package") {
  //       // Pricing constants (per your instruction)
  //       const divisor = 166; // volumetric divisor (in^3 -> lb)
  //       const ratePerLb = 3; // $ per lb
  //       const pickupFee = 5; // $ per pickup (per package formula uses pickupFee then per-lb)
  //       const minimumCharge = 10; // minimum charge per package (you can change)

  //       // compute per-package fares
  //       const packageDetails = []; // store computed details
  //       let aggregatePackageFare = 0;

  //       for (let i = 0; i < noOfPackages; ++i) {
  //         const actualWeightLb = Number(packageWeights[i]) || 0;
  //         const volumetricWeightLb = Number(packageVolums[i]) / divisor; // in lbs
  //         const billableWeight = Math.max(actualWeightLb, volumetricWeightLb);
  //         const roundedBillableWeight = Math.ceil(billableWeight);
  //         let fare =
  //           Number(pickupFee) +
  //           Number(roundedBillableWeight) * Number(ratePerLb);
  //         if (fare < minimumCharge) fare = minimumCharge;
  //         fare = Math.round((fare + Number.EPSILON) * 100) / 100;

  //         packageDetails.push({
  //           index: i,
  //           actualWeightLb,
  //           volumetricWeightLb: Number(volumetricWeightLb.toFixed(4)),
  //           billableWeight: roundedBillableWeight,
  //           fare,
  //         });

  //         aggregatePackageFare += fare;
  //       }

  //       aggregatePackageFare =
  //         Math.round((aggregatePackageFare + Number.EPSILON) * 100) / 100;

  //       // base fare for distance if you still want to add distance component (your formula uses only packages)
  //       // According to your formula totalFare = sum(fare for each package) — so no extra distance fare here.
  //       const farePackageUSD = aggregatePackageFare;
  //       const totalFare = farePackageUSD; // keep total as package sum; if you want add base distance fare, modify here
  //     }

  //     // rounding helpers
  //     const round2 = (v) =>
  //       Math.round((Number(v) + Number.EPSILON) * 100) / 100;
  //     const round3 = (v) =>
  //       Math.round((Number(v) + Number.EPSILON) * 1000) / 1000;

  //     const result = {
  //       status: true,
  //       message: "Fare estimated successfully",
  //       data: {
  //         from: { coordinates: fromCoords },
  //         to: { coordinates: toCoords },
  //         vehicleType: vehicleType,
  //         distanceMiles: round3(distanceMilesRaw),
  //         fareUSD: round2(totalFare),
  //         // optional breakdown
  //         ratePerMile: (function () {
  //           // attempt to infer per-mile rate from your calculateFare logic:
  //           // calculateFare returns distance * perMile; if distance > 0, compute perMile
  //           if (Number(distanceMilesRaw) > 0) {
  //             return round2(totalFare / distanceMilesRaw);
  //           }
  //           return null;
  //         })(),
  //       },
  //     };

  //     // if (typeof ack === "function") return ack(result);
  //     return socket.emit("fare:estimate_result", result);
  //   } catch (err) {
  //     console.error("fare:estimate error", err);
  //     const errResp = {
  //       status: false,
  //       message: err.message || "Failed to estimate fare",
  //     };
  //     // if (typeof ack === "function") return ack(errResp);
  //     return socket.emit("fare:error", errResp);
  //   }
  // });

  // fare estimate (emit-only version)
  socket.on("fare:estimate", async (payload = {}) => {
    try {
      // require authenticated socket.user
      const userId = socket.user?._id;
      if (!userId) {
        return socket.emit("fare:error", {
          status: false,
          message: "Unauthorized",
        });
      }

      const { from, to, vehicleType, rideType = "instant" } = payload || {};

      // validate vehicleType
      if (!vehicleType || typeof vehicleType !== "string") {
        return socket.emit("fare:error", {
          status: false,
          message: "vehicleType is required and must be a string",
        });
      }

      // validate from/to coordinates - expect: { coordinates: [lng, lat] }
      if (
        !from ||
        !Array.isArray(from.coordinates) ||
        from.coordinates.length !== 2 ||
        from.coordinates.some((c) => Number.isNaN(Number(c)))
      ) {
        return socket.emit("fare:error", {
          status: false,
          message: "Invalid 'from' coordinates",
        });
      }

      if (
        !to ||
        !Array.isArray(to.coordinates) ||
        to.coordinates.length !== 2 ||
        to.coordinates.some((c) => Number.isNaN(Number(c)))
      ) {
        return socket.emit("fare:error", {
          status: false,
          message: "Invalid 'to' coordinates",
        });
      }

      // normalize numbers
      const fromCoords = from.coordinates.map(Number);
      const toCoords = to.coordinates.map(Number);

      // compute distance using your RideService haversineMiles
      const distanceMilesRaw = rideService.haversineMiles(fromCoords, toCoords);

      // compute base fare using your calculateFare(vehicleType, distanceMiles)
      const baseFare = await rideService.calculateFare(vehicleType, distanceMilesRaw);

      // rounding helpers
      const round2 = (v) =>
        Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100;
      const round3 = (v) =>
        Math.round((Number(v || 0) + Number.EPSILON) * 1000) / 1000;

      let totalFare = 0;
      let breakdown = null;

      if (rideType === "instant") {
        totalFare = baseFare;
        breakdown = { baseFare: round2(baseFare) };
      } else if (rideType === "courier-food") {
        // const fareFoodUSD = 10;
        const config = await RideConfig.findOne({}, { courierFoodRate: 1 }).lean();
        const fareFoodUSD = config.courierFoodRate;
        totalFare = Number(
          (Number(baseFare || 0) + Number(fareFoodUSD)).toFixed(2)
        );
        breakdown = {
          baseFare: round2(baseFare),
          courierFoodSurcharge: fareFoodUSD,
        };
      } else if (rideType === "courier-package") {
        const {
          numberOfPackages,
          packageWeights = [],
          packageVolums = [],
        } = payload || {};
        const noOfPackages = Number(numberOfPackages) || 0;

        if (
          !noOfPackages ||
          !Array.isArray(packageWeights) ||
          !Array.isArray(packageVolums) ||
          packageWeights.length !== noOfPackages ||
          packageVolums.length !== noOfPackages
        ) {
          return socket.emit("fare:error", {
            status: false,
            message:
              "For courier-package you must provide numberOfPackages and matching packageWeights and packageVolums arrays.",
          });
        }

        // Pricing constants
        const divisor = 166; // volumetric divisor (in^3 -> lb)
        const ratePerLb = 3; // $ per lb
        const pickupFee = 5; // $ per package pickup
        const minimumCharge = 10; // minimum charge per package

        const packageDetails = [];
        let aggregatePackageFare = 0;

        for (let i = 0; i < noOfPackages; ++i) {
          const actualWeightLb = Number(packageWeights[i]) || 0;
          const volumetricWeightLb = Number(packageVolums[i]) / divisor;
          const billableWeight = Math.max(actualWeightLb, volumetricWeightLb);
          const roundedBillableWeight = Math.ceil(billableWeight);
          let fare =
            Number(pickupFee) +
            Number(roundedBillableWeight) * Number(ratePerLb);
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

        // totalFare = packages sum (no distance added by default)
        totalFare = aggregatePackageFare;
        breakdown = { packageDetails, farePackageUSD: aggregatePackageFare };
      } else {
        // unknown rideType fallback
        totalFare = baseFare;
        breakdown = { baseFare: round2(baseFare) };
      }

      const result = {
        status: true,
        message: "Fare estimated successfully",
        data: {
          from: { coordinates: fromCoords },
          to: { coordinates: toCoords },
          vehicleType,
          rideType,
          distanceMiles: round3(distanceMilesRaw),
          fareUSD: round2(totalFare),
          ratePerMile:
            Number(distanceMilesRaw) > 0
              ? round2(totalFare / distanceMilesRaw)
              : null,
          breakdown,
        },
      };

      return socket.emit("fare:estimate_result", result);
    } catch (err) {
      console.error("fare:estimate error", err);
      return socket.emit("fare:error", {
        status: false,
        message: err.message || "Failed to estimate fare",
      });
    }
  });

  // 1) drivers:nearby
  // payload: { coords: [lng, lat] }  (optional: radiusMiles, max)
  // socket.on("drivers:nearby", async (payload = {}, ack) => {
  //   try {
  //     const sid =
  //       socket.user && socket.user._id ? String(socket.user._id) : null;
  //     if (!sid) {
  //       if (typeof ack === "function")
  //         ack({ status: false, message: "Unauthorized" });
  //       return socket.emit("drivers:error", { message: "Unauthorized" });
  //     }

  //     const coords = Array.isArray(payload.coords)
  //       ? payload.coords.map(Number)
  //       : socket.user.location &&
  //         Array.isArray(socket.user.location.coordinates)
  //       ? socket.user.location.coordinates
  //       : null;

  //     if (
  //       !coords ||
  //       coords.length !== 2 ||
  //       coords.some((c) => Number.isNaN(c))
  //     ) {
  //       if (typeof ack === "function")
  //         ack({ status: false, message: "Invalid coords" });
  //       return;
  //     }

  //     const radiusMiles = Number(payload.radiusMiles) || 30;
  //     const max = Number(payload.max) || 50;

  //     const nearby = liveDriverStore.findWithinRadius(coords, {
  //       radiusMiles,
  //       max,
  //       haversineMiles: rideService.haversineMiles.bind(rideService),
  //     });

  //     // batch fetch profiles
  //     const driverIds = nearby.map((d) => d.driverId);
  //     let profilesMap = new Map();
  //     if (driverIds.length) {
  //       const profiles = await User.find({ _id: { $in: driverIds } })
  //         .select("_id fullName profileImageKey")
  //         .lean();

  //       // convert profileImageKey -> profileImage (full URL)
  //       profilesMap = new Map(
  //         profiles.map((p) => {
  //           const profile = { ...p };

  //           const key = profile.profileImageKey || profile.profileImage || null;
  //           profile.profileImage = key
  //             ? rideService.buildProfileImage(key)
  //             : null;

  //           // remove the raw key so only profileImage remains
  //           delete profile.profileImageKey;

  //           return [String(profile._id), profile];
  //         })
  //       );
  //     }

  //     const result = nearby.map((d) => ({
  //       driverId: d.driverId,
  //       coordinates: d.coordinates,
  //       updatedAt: d.updatedAt,
  //       isAvailable: d.isAvailable,
  //       distanceFromUserMiles: d.distanceMiles,
  //       profile: profilesMap.get(d.driverId) || null,
  //       meta: d.meta,
  //     }));

  //     let message = "Nearby drivers fetched successfully"
  //     if (typeof ack === "function") ack({ status: true, message: message, data: result });
  //     else socket.emit("drivers:nearby_result", { status: true, message: message, data: result });
  //   } catch (err) {
  //     console.error("drivers:nearby error", err);
  //     if (typeof ack === "function") ack({ status: false, message: err.message });
  //   }
  // });

  socket.on("drivers:nearby", async (payload = {}) => {
    try {
      const userId = socket.user?._id;
      if (!userId)
        return socket.emit("drivers:error", {
          status: false,
          message: "Unauthorized",
        });

      const coords = Array.isArray(payload.coords)
        ? payload.coords.map(Number)
        : socket.user.location?.coordinates;

      if (!coords || coords.length !== 2 || coords.some(isNaN))
        return socket.emit("drivers:error", {
          status: false,
          message: "Invalid coords",
        });

      const radiusMiles = Number(payload.radiusMiles) || 30;
      const max = Number(payload.max) || 50;

      // Register user in liveUserStore
      liveUserStore.set(String(userId), {
        socketId: socket.id,
        coords,
        radiusMiles,
      });

      // Find nearby drivers
      const nearby = liveDriverStore.findWithinRadius(coords, {
        radiusMiles,
        max,
        haversineMiles: rideService.haversineMiles.bind(rideService),
      });

      // Fetch driver profiles
      const driverIds = nearby.map((d) => d.driverId);
      let profilesMap = new Map();
      if (driverIds.length) {
        const profiles = await User.find({ _id: { $in: driverIds } })
          .select("_id fullName profileImageKey")
          .lean();

        profilesMap = new Map(
          profiles.map((p) => {
            const profile = { ...p };
            const key = profile.profileImageKey || profile.profileImage || null;
            profile.profileImage = key
              ? rideService.buildProfileImage(key)
              : null;
            delete profile.profileImageKey;
            return [String(profile._id), profile];
          })
        );
      }

      // Format result
      const result = nearby.map((d) => ({
        driverId: d.driverId,
        coordinates: d.coordinates,
        updatedAt: d.updatedAt,
        isAvailable: d.isAvailable,
        distanceFromUserMiles: d.distanceMiles,
        profile: profilesMap.get(d.driverId) || null,
        meta: d.meta,
      }));

      // Emit nearby drivers to the user
      socket.emit("drivers:nearby_result", {
        status: true,
        message: "Nearby drivers fetched successfully",
        data: result,
      });
    } catch (err) {
      console.error("drivers:nearby error", err);
      socket.emit("drivers:error", { status: false, message: err.message });
    }
  });

  // 2) ride:send_request (socket-only flow; no HTTP)
  // payload: { rideId?, userId, rideType, vehicleType, from, to, distanceMiles, fareUSD, radiusMiles?, maxDrivers? }
  socket.on("ride:send_request", async (payload = {}, ack) => {
    try {
      const sid =
        socket.user && socket.user._id ? String(socket.user._id) : null;
      if (!sid || String(payload.userId) !== sid) {
        const msg = "Unauthorized: userId mismatch";
        // if (typeof ack === "function") ack({ status: false, message: msg });
        return socket.emit("ride:error", { status: false, message: msg });
      }

      // delegate to service which uses live-driver-store
      const result = await rideService.sendRideRequestUsingLiveDrivers(
        payload,
        {
          radiusMiles: payload.radiusMiles || undefined,
          maxDrivers: payload.maxDrivers || undefined,
        }
      );
      socket.emit("ride:request_sent", {
        status: true,
        message: "Ride request sent successfully",
        data: {
          rideId: String(result.ride._id),
          notifiedDrivers: result.notifiedDriversCount,
        },
      });
    } catch (err) {
      // console.error("ride:send_request error", err);
      // if (typeof ack === "function") ack({ status: false, message: err.message });
      socket.emit("ride:error", { status: false, message: err.message });
    }
  });

  // user cancels a ride
  // payload: { rideId, reason? }
  socket.on("ride:cancel", async (payload = {}, ack) => {
    try {
      const sid =
        socket.user && socket.user._id ? String(socket.user._id) : null;
      if (!sid) throw new Error("Unauthorized");
      const { rideId, reason } = payload || {};
      if (!rideId) throw new Error("rideId required");

      const updatedRide = await rideService.cancelRide({
        actor: "user",
        actorId: sid,
        rideId,
        reason: reason || "cancelled by user",
      });

      // if (typeof ack === "function") ack({ ok: true, ride: updatedRide });
      socket.emit("ride:cancel_success", {
        status: true,
        message: "Ride has been cancelled successfully",
        data: {
          rideId: String(rideId),
          cancelledBy: "user",
          reason: reason || "cancelled by user",
          ride: updatedRide,
          cancelledAt: new Date(),
        },
      });

      // notify ride room
      io.to(`ride:${rideId}`).emit("ride:cancelled", {
        status: true,
        message: "Ride has been cancelled by the user",
        data: {
          rideId: String(rideId),
          cancelledBy: "user",
          reason: reason || "cancelled by user",
          ride: updatedRide,
          cancelledAt: new Date(),
        },
      });
    } catch (err) {
      // if (typeof ack === "function") ack({ ok: false, message: err.message });
      socket.emit("ride:error", { status: false, message: err.message });
    }
  });

  // user adds a stop while ride is ongoing
  // payload: { rideId, stop: { coordinates: [lng,lat], address? }, fixedChargeUSD? }
  socket.on("ride:add_stop", async (payload = {}, ack) => {
    try {
      const sid =
        socket.user && socket.user._id ? String(socket.user._id) : null;
      if (!sid) throw new Error("Unauthorized");
      const { rideId, stop, fixedChargeUSD } = payload || {};
      if (!rideId) throw new Error("rideId required");
      if (
        !stop ||
        !Array.isArray(stop.coordinates) ||
        stop.coordinates.length !== 2
      ) {
        throw new Error("Invalid stop location");
      }

      // default fixed charge $5 if not provided
      // const charge = fixedChargeUSD !== undefined ? Number(fixedChargeUSD) : 5;

      const config = await RideConfig.findOne({}, { addStopRate: 1 }).lean();
      const charge = config.addStopRate;

      const updatedRide = await rideService.addStopToRide({
        userId: sid,
        rideId,
        stop,
        addedChargeUSD: charge,
      });

      socket.emit("ride:stop_added", {
        status: true,
        message: "Stop has been added successfully",
        data: {
          rideId: String(rideId),
          stop: {
            coordinates: stop.coordinates,
            address: stop.address || null,
            addedAt: new Date(),
          },
          addedChargeUSD: charge,
          ride: updatedRide,
        },
      });

      // notify ride room about new stop and updated fare
      io.to(`ride:${rideId}`).emit("ride:stop_added", {
        status: true,
        message: "New Stop has been added successfully",
        data: {
          rideId: String(rideId),
          stop: {
            coordinates: stop.coordinates,
            address: stop.address || null,
            addedAt: new Date(),
          },
          addedChargeUSD: charge,
          ride: updatedRide,
        },
      });

      // also emit fare update event (optional helper for clients)
      io.to(`ride:${rideId}`).emit("ride:fare_updated", {
        status: true,
        message: "Fare has been updated successfully for added stop",
        data: {
          rideId: String(rideId),
          newFareUSD: updatedRide.fareUSD,
        },
      });
    } catch (err) {
      // if (typeof ack === "function") ack({ ok: false, message: err.message });
      socket.emit("ride:error", { status: false, message: err.message });
    }
  });

  // ride:schedule_request
  // payload: { userId, rideType, vehicleType, date, time, from, to }
  socket.on("ride:schedule_request", async (payload = {}, ack) => {
    try {
      const sid =
        socket.user && socket.user._id ? String(socket.user._id) : null;
      if (!sid) {
        // if (typeof ack === "function")
        // ack({ ok: false, message: "Unauthorized" });
        return socket.emit("ride:error", {
          status: false,
          message: "Unauthorized",
        });
      }
      // ensure payload userId matches socket user
      if (String(payload.userId) !== sid) {
        // if (typeof ack === "function")
        // ack({ ok: false, message: "userId mismatch" });
        return socket.emit("ride:error", {
          status: false,
          message: "Unauthorized: userId mismatch",
        });
      }

      // delegate to RideService which will create RideRequest and notify drivers
      const result = await rideService.sendScheduleRideRequestUsingLiveDrivers(
        payload,
        {
          radiusMiles: payload.radiusMiles || undefined,
          maxDrivers: payload.maxDrivers || undefined,
        }
      );

      // ack with ride id and count
      // if (typeof ack === "function")
      //   ack({
      //     ok: true,
      //     message: "Schedule ride request created and drivers notified",
      //     data: {
      //       rideId: String(result.ride._id),
      //       notifiedDrivers: result.notifiedDriversCount,
      //     },
      //   });

      // also emit to user socket for convenience
      socket.emit("ride:schedule_created", {
        status: true,
        message: "Schedule ride request created and drivers notified",
        data: {
          rideId: String(result.ride._id),
          notifiedDrivers: result.notifiedDriversCount,
          ride: result.ride,
        },
      });
    } catch (err) {
      // console.error("ride:schedule_request error", err);
      // if (typeof ack === "function") ack({ ok: false, message: err.message });
      socket.emit("ride:error", { status: false, message: err.message });
    }
  });

  // user requests a food/package delivery (instant)
  socket.on("ride:delivery_request", async (payload = {}, ack) => {
    try {
      const sid =
        socket.user && socket.user._id ? String(socket.user._id) : null;
      if (!sid) {
        // if (typeof ack === "function")
        //   ack({ ok: false, message: "Unauthorized" });
        return socket.emit("ride:error", {
          status: false,
          message: "Unauthorized",
        });
      }

      // ensure payload userId matches socket user
      if (String(payload.userId) !== sid) {
        const msg = "Unauthorized: userId mismatch";
        // if (typeof ack === "function") ack({ ok: false, message: msg });
        return socket.emit("ride:error", { status: false, message: msg });
      }

      // delegate to service
      const result = await rideService.sendFoodDeliveryRequestUsingLiveDrivers(
        payload,
        {
          radiusMiles: payload.radiusMiles || undefined,
          maxDrivers: payload.maxDrivers || undefined,
        }
      );

      // if (typeof ack === "function") {
      //   ack({
      //     ok: true,
      //     message: "Delivery request created and drivers notified",
      //     data: {
      //       rideId: String(result.ride._id),
      //       notifiedDrivers: result.notifiedDriversCount,
      //     },
      //   });
      // }

      // convenience emit to user
      socket.emit("ride:delivery_created", {
        status: true,
        message: "Courier food delivery request created and drivers notified",
        data: {
          rideId: String(result.ride._id),
          notifiedDrivers: result.notifiedDriversCount,
          ride: result.ride,
        },
      });
    } catch (err) {
      // console.error("ride:delivery_request error", err);
      // if (typeof ack === "function") ack({ ok: false, message: err.message });
      socket.emit("ride:error", { status: false, message: err.message });
    }
  });

  // user requests a package delivery (instant)
  socket.on("ride:package_request", async (payload = {}, ack) => {
    try {
      const sid =
        socket.user && socket.user._id ? String(socket.user._id) : null;
      if (!sid) {
        // if (typeof ack === "function")
        //   ack({ ok: false, message: "Unauthorized" });
        return socket.emit("ride:error", {
          status: false,
          message: "Unauthorized",
        });
      }
      if (String(payload.userId) !== sid) {
        const msg = "Unauthorized: userId mismatch";
        // if (typeof ack === "function") ack({ ok: false, message: msg });
        return socket.emit("ride:error", { status: false, message: msg });
      }

      const result =
        await rideService.sendPackageDeliveryRequestUsingLiveDrivers(payload, {
          radiusMiles: payload.radiusMiles || undefined,
          maxDrivers: payload.maxDrivers || undefined,
        });

      // convenience emit to user
      socket.emit("ride:package_created", {
        status: true,
        message:
          "Courier package delivery request created and drivers notified",
        data: {
          rideId: String(result.ride._id),
          notifiedDrivers: result.notifiedDriversCount,
          ride: result.ride,
        },
      });
    } catch (err) {
      socket.emit("ride:error", { status: false, message: err.message });
    }
  });

  // Optional: user can join a ride room explicitly
  socket.on("ride:join", ({ rideId } = {}, ack) => {
    try {
      if (!rideId) return ack && ack({ ok: false, message: "rideId required" });
      socket.join(`ride:${rideId}`);
      if (typeof ack === "function") ack({ ok: true });
    } catch (err) {
      if (typeof ack === "function") ack({ ok: false, message: err.message });
    }
  });

  // cleanup - client disconnect
  socket.on("disconnect", (reason) => {
    // nothing special here for users
  });
};
