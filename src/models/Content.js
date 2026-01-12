// models/content.js
const mongoose = require("mongoose");

const ContentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["privacy_policy", "terms_and_conditions"],
      required: true,
      index: true,
    },
    title: { type: String, trim: true, default: "" },
    content: { type: String, required: true, maxlength: 2000 },
    is_active: { type: Boolean, default: true, index: true },
    meta: {
      version: { type: String, default: "1.0" },
      language: { type: String, default: "en" },
    },
  },
  { timestamps: true }
);

ContentSchema.index({ type: 1, "meta.language": 1, is_active: 1 });

module.exports = mongoose.model("Content", ContentSchema);
