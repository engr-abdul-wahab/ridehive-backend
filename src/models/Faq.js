// models/Faq.js
const mongoose = require("mongoose");

const FaqSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      trim: true,
      required: true,
      maxlength: 500,
    },
    answer: {
      type: String,
      trim: true,
      required: true,
      maxlength: 2000,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true }
);

// optional index for faster queries on status + createdAt
FaqSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("Faq", FaqSchema);
