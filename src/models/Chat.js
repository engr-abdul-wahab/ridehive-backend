const mongoose = require("mongoose");

const ChatSchema = new mongoose.Schema(
  {
    rideId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ride",
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    senderRole: { type: String, enum: ["user", "driver"], required: true },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    }, // added
    message: { type: String, default: null },
    files: [
      {
        key: String,
        url: String,
        originalname: String,
        mimetype: String,
        size: Number,
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Chat", ChatSchema);
