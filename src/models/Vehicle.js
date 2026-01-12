// src/models/Vehicle.js
const mongoose = require("mongoose");

const vehicleSchema = new mongoose.Schema(
  {
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    carMakeModel: { type: String, required: true, trim: true },
    licensePlateNumber: { type: String, required: true, trim: true },
    color: { type: String, required: true, trim: true },
    specification: { type: String, default: "", trim: true },
    vehicleType: { type: String, default: "", trim: true },

    rideOption: {
      type: String,
      enum: ["car_standard", "car_deluxe", "motorcycle_standard"],
      required: true,
    },

    // S3 keys
    licensePlateKey: { type: String, default: null },
    vehiclePictureKey: { type: String, default: null },
    driverLicenseKey: { type: String, default: null },
    vehicleRegistrationKey: { type: String, default: null },
    taxiOperatorLicenseKey: { type: String, default: null },
    insuranceCardKey: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Vehicle", vehicleSchema);
