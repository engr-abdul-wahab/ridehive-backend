// src/models/RideRequest.js
const mongoose = require("mongoose");

const locationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], required: true }, // [lng, lat]
    address: { type: String },
  },
  { _id: false }
);

const rideSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  // ✅ Driver assigned to this ride (null if unassigned)
  driverId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

  rideType: {
    type: String,
    enum: ["instant", "schedule", "courier-food", "courier-package"],
    default: "instant",
  },

  vehicleType: {
    type: String,
    enum: ["car_standard", "car_deluxe", "motorcycle_standard"],
    required: true,
  },

  from: { type: locationSchema, required: true },
  to: { type: locationSchema, required: true },

  distanceMiles: { type: Number, required: true },
  fareUSD: { type: Number, required: true },
  fareFoodUSD: { type: Number, default: 0 },
  farePackageUSD: { type: Number, default: 0 },

  // ✅ Ride status (used to prevent multiple driver assignment)
  status: {
    type: String,
    enum: [
      "created",
      "pending",
      "accepted",
      "ongoing",
      "completed",
      "cancelled",
    ],
    default: "created",
  },

  meta: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now },
});

// ✅ 2dsphere index for geo queries
rideSchema.index({ from: "2dsphere" });
rideSchema.index({ to: "2dsphere" });

// ✅ Optional helper: check if ride is available for assignment
rideSchema.methods.isAssignable = function () {
  return this.driverId === null && ["pending", "created"].includes(this.status);
};

module.exports = mongoose.model("RideRequest", rideSchema);
