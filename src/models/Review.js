const mongoose = require("mongoose");

const ReviewSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    rideId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ride",
      required: true,
      index: true,
    },
    paymentId: { type: String, default: null }, // optional: stripe/paynow paymentId
    rating: { type: Number, required: true, min: 1, max: 5 },
    review: { type: String, default: null },
    isAnonymous: { type: Boolean, default: false },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// Prevent more than one review per ride
ReviewSchema.index(
  { rideId: 1 },
  { unique: true, partialFilterExpression: { rideId: { $exists: true } } }
);

// Useful compound indexes for queries
ReviewSchema.index({ driverId: 1, createdAt: -1 });
ReviewSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("Review", ReviewSchema);
