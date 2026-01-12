// src/sockets/handlers/driver-handler.js
const liveDriverStore = require("../../stores/live-driver-store");
const {
  map: liveUserStore,
  haversineMiles,
} = require("../../stores/live-user-store");
const User = require("../../models/User");
const RideService = require("../../service/ride-service");

const rideService = new RideService();

exports.register = (socket, io) => {
  const driverId =
    socket.user && socket.user._id ? String(socket.user._id) : null;

  // driver: update live location
  // payload: { coordinates: [lng, lat], address?, speed?, meta? }
  // socket.on("driver:update_location", (payload = {}) => {
  //   try {
  //     if (!driverId) return;
  //     const coords = Array.isArray(payload.coordinates)
  //       ? payload.coordinates.map(Number)
  //       : null;
  //     if (
  //       !coords ||
  //       coords.length !== 2 ||
  //       coords.some((c) => Number.isNaN(c))
  //     ) {
  //       return socket.emit("driver:error", { status: false, message: "Invalid coordinates" });
  //     }

  //     const isAvailable =
  //       payload.isAvailable !== undefined ? Boolean(payload.isAvailable) : true;
  //     // preserve existing meta
  //     const existing = liveDriverStore.get(driverId) || {};
  //     const meta = Object.assign({}, existing.meta || {}, payload.meta || {});
  //     liveDriverStore.set(driverId, { coordinates: coords, isAvailable, meta });

  //     // emit driver's own location update to their room (so their devices see it)
  //     io.to(`driver:${driverId}`).emit("driver:location_update", {
  //       status: true,
  //       message: "Driver location updated successfully",
  //       data: {
  //         driverId,
  //         coordinates: coords,
  //         updatedAt: new Date(),
  //       },
  //     });

  //     // if driver has active ride (meta.currentRideId), emit to ride room
  //     const currentRideId =
  //       meta.currentRideId ||
  //       (existing.meta && existing.meta.currentRideId) ||
  //       null;
  //     if (currentRideId) {
  //       io.to(`ride:${currentRideId}`).emit("ride:location_update", {
  //         status: true,
  //         message: "Driver location updated successfully",
  //         data: {
  //           driverId,
  //           coordinates: coords,
  //           updatedAt: new Date(),
  //         },
  //       });
  //     }

  //     // ack
  //     // socket.emit("driver:update_ok", { ok: true, updatedAt: new Date() });
  //   } catch (err) {
  //     socket.emit("driver:error", { status: false, message: err.message });
  //   }
  // });

  socket.on("driver:update_location", async (payload = {}) => {
    try {
      if (!driverId) return;

      // Parse coordinates
      const coords = Array.isArray(payload.coordinates)
        ? payload.coordinates.map(Number)
        : null;

      if (!coords || coords.length !== 2 || coords.some(isNaN)) {
        return socket.emit("driver:error", {
          status: false,
          message: "Invalid coordinates",
        });
      }

      // Availability flag
      const isAvailable =
        payload.isAvailable !== undefined ? Boolean(payload.isAvailable) : true;

      // Preserve existing meta
      const existing = liveDriverStore.get(driverId) || {};
      const meta = Object.assign({}, existing.meta || {}, payload.meta || {});
      liveDriverStore.set(driverId, { coordinates: coords, isAvailable, meta });

      // Fetch driver profile
      const driverProfile = await User.findById(driverId)
        .select("_id fullName profileImageKey")
        .lean();

      const profile = driverProfile
        ? {
            _id: driverProfile._id,
            fullName: driverProfile.fullName,
            profileImage: driverProfile.profileImageKey
              ? rideService.buildProfileImage(driverProfile.profileImageKey)
              : null,
          }
        : null;

      const driverData = {
        driverId,
        coordinates: coords,
        updatedAt: new Date(),
        isAvailable,
        meta,
        profile,
      };

      // Emit to driver's own room
      io.to(`driver:${driverId}`).emit("driver:location_update", {
        status: true,
        message: "Driver location updated successfully",
        data: driverData,
      });

      // Emit to ride room if driver has active ride
      const currentRideId =
        meta.currentRideId || existing.meta?.currentRideId || null;
      if (currentRideId) {
        io.to(`ride:${currentRideId}`).emit("ride:location_update", {
          status: true,
          message: "Driver location updated successfully",
          data: driverData,
        });
      }

      // 🔹 Emit to all nearby users
      for (const [userId, user] of liveUserStore.entries()) {
        if (!user.coords || !Array.isArray(user.coords)) continue;

        const distance = haversineMiles(coords, user.coords);
        if (distance <= (user.radiusMiles || 30)) {
          io.to(user.socketId).emit("drivers:nearby_update", {
            status: true,
            message: "Nearby driver location updated",
            data: {
              ...driverData,
              distanceFromUserMiles: distance,
            },
          });
        }
      }
    } catch (err) {
      socket.emit("driver:error", { status: false, message: err.message });
    }
  });
  // driver accepts a ride
  // payload: { rideId }
  socket.on("ride:accept", async ({ rideId } = {}, ack) => {
    try {
      if (!driverId) throw new Error("Unauthorized");
      const result = await rideService.driverAcceptRide({ driverId, rideId });
      // if (typeof ack === "function") ack({ ok: true, ride: result });
      socket.emit("ride:accepted_success", {
        status: true,
        message: "Ride request has been accepted",
        data: result,
      });
    } catch (err) {
      // if (typeof ack === "function") ack({ ok: false, message: err.message });
      socket.emit("ride:error", { status: false, message: err.message });
    }
  });

  // driver arrived at pickup
  // payload: { rideId, location: { coordinates: [lng,lat], address? } }
  socket.on("ride:arrived", async (payload = {}, ack) => {
    try {
      if (!driverId) throw new Error("Unauthorized");
      const { rideId, location } = payload;
      const res = await rideService.driverArrivedPickup({
        driverId,
        rideId,
        location,
      });
      // if (typeof ack === "function") ack({ ok: true, data: res });
      socket.emit("ride:arrived_success", res);
    } catch (err) {
      // if (typeof ack === "function") ack({ ok: false, message: err.message });
      socket.emit("ride:error", { status: false, message: err.message });
    }
  });

  // driver starts ride
  // payload: { rideId, startLocation, startTs? }
  socket.on("ride:start", async (payload = {}, ack) => {
    try {
      if (!driverId) throw new Error("Unauthorized");
      const { rideId, startLocation, startTs } = payload;
      const res = await rideService.driverStartRide({
        driverId,
        rideId,
        startLocation,
        startTs: startTs ? new Date(startTs) : new Date(),
      });
      // if (typeof ack === "function") ack({ ok: true, ride: res });
      socket.emit("ride:start_success", {
        status: true,
        message: "Ride has been started successfully",
        data: res,
      });
    } catch (err) {
      // if (typeof ack === "function") ack({ ok: false, message: err.message });
      socket.emit("ride:error", { status: false, message: err.message });
    }
  });

  // driver cancels a ride
  // payload: { rideId, reason? }
  socket.on("ride:cancel", async (payload = {}, ack) => {
    try {
      if (!driverId) throw new Error("Unauthorized");
      const { rideId, reason } = payload || {};
      if (!rideId) throw new Error("rideId required");

      // call service to cancel (actor = driver)
      const updatedRide = await rideService.cancelRide({
        actor: "driver",
        actorId: driverId,
        rideId,
        reason: reason || "cancelled by driver",
      });

      // ack caller
      // if (typeof ack === "function") ack({ ok: true, ride: updatedRide });
      socket.emit("ride:cancel_success", {
        status: true,
        message: "Ride has been cancelled successfully",
        data: {
          rideId: String(rideId),
          cancelledBy: "driver",
          reason: reason || "cancelled by driver",
          ride: updatedRide,
          cancelledAt: new Date(),
        },
      });

      // notify everyone in the ride room
      io.to(`ride:${rideId}`).emit("ride:cancelled", {
        status: true,
        message: "Ride has been cancelled by the driver",
        data: {
          rideId: String(rideId),
          cancelledBy: "driver",
          reason: reason || "cancelled by driver",
          ride: updatedRide,
          cancelledAt: new Date(),
        },
      });
    } catch (err) {
      // if (typeof ack === "function") ack({ ok: false, message: err.message });
      socket.emit("ride:error", { status: false, message: err.message });
    }
  });

  // driver ends ride
  // payload: { rideId, endLocation, endTs?, finalFare? }
  socket.on("ride:end", async (payload = {}, ack) => {
    try {
      if (!driverId) throw new Error("Unauthorized");
      const { rideId, endLocation, endTs, finalFare } = payload;
      const res = await rideService.driverEndRide({
        driverId,
        rideId,
        endLocation,
        endTs: endTs ? new Date(endTs) : new Date(),
        finalFare: finalFare !== undefined ? finalFare : null,
      });
      // if (typeof ack === "function") ack({ ok: true, ride: res });
      socket.emit("ride:end_success", res);
    } catch (err) {
      // if (typeof ack === "function") ack({ ok: false, message: err.message });
      socket.emit("ride:error", { status: false, message: err.message });
    }
  });

  // driver set availability
  socket.on("driver:set_available", ({ isAvailable = true } = {}, ack) => {
    try {
      if (!driverId) throw new Error("Unauthorized");
      const existing = liveDriverStore.get(driverId) || {};
      liveDriverStore.set(driverId, {
        coordinates: existing.coordinates || [0, 0],
        isAvailable: Boolean(isAvailable),
        meta: existing.meta || {},
      });
      if (typeof ack === "function") ack({ ok: true });
    } catch (err) {
      if (typeof ack === "function") ack({ ok: false, message: err.message });
    }
  });

  // optional: driver join ride room manually (redundant with service)
  socket.on("ride:join", ({ rideId } = {}, ack) => {
    try {
      if (!driverId) throw new Error("Unauthorized");
      socket.join(`ride:${rideId}`);
      if (typeof ack === "function") ack({ ok: true });
    } catch (err) {
      if (typeof ack === "function") ack({ ok: false, message: err.message });
    }
  });

  // cleanup on disconnect
  socket.on("disconnect", () => {
    try {
      if (!driverId) return;
      const existing = liveDriverStore.get(driverId);
      if (existing) {
        // mark unavailable but keep coordinates
        liveDriverStore.set(driverId, {
          coordinates: existing.coordinates,
          isAvailable: false,
          meta: existing.meta || {},
        });
      }
    } catch (err) {
      // ignore
    }
  });
};
