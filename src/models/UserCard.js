const mongoose = require("mongoose");

const UserCardSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    stripePaymentMethodId: { type: String, required: true },
    brand: { type: String },
    last4: { type: String },
    expMonth: { type: Number },
    expYear: { type: Number },
    isDefault: { type: Boolean, default: false },
    billingDetails: { type: Object, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model("UserCard", UserCardSchema);
