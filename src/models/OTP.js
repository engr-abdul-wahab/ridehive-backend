const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    code: { type: String, required: true },
    type: { type: String, default: "verify" }, // 'verify' or 'reset'
    used: { type: Boolean, default: false }, // track if consumed
    usedAt: { type: Date, default: null }, // when it was used
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// TTL index on expiresAt (Mongo will remove after expire)
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("OTP", otpSchema);
