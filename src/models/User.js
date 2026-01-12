// src/models/User.js
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    index: true,
    unique: true,
    lowercase: true,
  },
  password: { type: String, default: null }, // nullable for social accounts

  role: {
    type: String,
    enum: ["admin", "user", "driver"],
    default: "user",
  },

  isVerified: { type: Boolean, default: false },
  profileCompleted: { type: Boolean, default: false },
  pushNotification: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false },

  vehicleDetails: {
    type: Boolean,
    default: function () {
      // Automatically set based on role
      if (this.role === "driver") return false;
      return true; // for 'admin' and 'user'
    },
  },

  isAdminApproved: {
    type: Boolean,
    default: function () {
      // Automatically set based on role
      if (this.role === "driver") return false;
      return true; // for 'admin' and 'user'
    },
  },

  // common profile fields:
  fullName: { type: String, default: null },
  phone: { type: String, default: null },
  gender: {
    type: String,
    enum: ["male", "female", "other", null],
    default: null,
  },

  location: {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
    address: { type: String },
  },

  bio: { type: String, default: null },

  profileImageKey: { type: String, default: null }, // stores S3 key like "Asuba-Connection-Uploads/images/..."

  socialId: { type: String, index: true, default: null },
  socialType: {
    type: String,
    enum: ["google", "apple", "other"],
    default: null,
  },

  // ✅ Device info for notifications
  deviceType: {
    type: String,
    enum: ["android", "ios", "web", null],
    default: null,
  },

  deviceToken: { type: String, default: null },

  stripeCustomerId: { type: String, default: null },

  stripeAccountId: { type: String, default: null },

  deletedAt: { type: Date, default: null },

  tokenInvalidBefore: { type: Date, default: null },

  lastAuthToken: { type: String, default: null },

  meta: { type: mongoose.Schema.Types.Mixed, default: {} },

  createdAt: { type: Date, default: Date.now },
});

userSchema.index({ location: "2dsphere" });

/**
 * Optional instance helper to set last token.
 * Not required but convenient.
 */
userSchema.methods.setAuthToken = async function (token) {
  this.lastAuthToken = token;
  await this.save();
  return token;
};

module.exports = mongoose.model("User", userSchema);
