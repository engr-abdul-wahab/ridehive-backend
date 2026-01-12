// src/repositories/ride-repository.js
const RideRequest = require("../models/RideRequest");

class RideRepository {
  async create(payload) {
    const r = new RideRequest(payload);
    return r.save();
  }

  async findById(id) {
    return RideRequest.findById(id).lean();
  }

  async updateStatus(rideId, status, extra = {}) {
    // extra: object to merge (e.g., { driverId } or { fareUSD } )
    const update = Object.assign({ status }, extra);
    return RideRequest.findByIdAndUpdate(rideId, update, { new: true }).lean();
  }

  async assignDriverIfUnassigned(rideId, driverId) {
    const updated = await RideRequest.findOneAndUpdate(
      { _id: rideId, driverId: null, status: { $in: ["pending", "created"] } },
      { driverId, status: "accepted" },
      { new: true }
    ).lean();
    return updated;
  }

  async appendEvent(rideId, eventObj) {
    // store events in meta.events array for history
    return RideRequest.findByIdAndUpdate(
      rideId,
      { $push: { "meta.events": eventObj } },
      { new: true }
    ).lean();
  }

  async incrementCounter(rideId, field, by = 1) {
    const update = {};
    update[field] = by;
    return RideRequest.findByIdAndUpdate(
      rideId,
      { $inc: update },
      { new: true }
    ).lean();
  }
}

module.exports = new RideRepository();
