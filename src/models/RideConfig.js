const mongoose = require("mongoose");

const RideConfigSchema = new mongoose.Schema(
  {
    carStandardRate: { type: Number, required: true, default: 2.0 },
    carDeluxeRate: { type: Number, required: true, default: 3.0 },
    motorcycleStandardRate: { type: Number, required: true, default: 1.0 },
    courierFoodRate: { type: Number, required: true, default: 10.0 },
    addStopRate: { type: Number, required: true, default: 5.0 },
    defaultRadiusMiles: { type: Number, required: true, default: 30 },
    maxNotifyDrivers: { type: Number, required: true, default: 200 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true, collection: "RideConfig" }
);

// Helper to get the singleton config or create default
RideConfigSchema.statics.getConfig = async function () {
  let cfg = await this.findOne().lean().exec();
  if (!cfg) {
    cfg = await this.create({
      carStandardRate: 2.0,
      carDeluxeRate: 3.0,
      motorcycleStandardRate: 1.0,
      courierFoodRate: 10.0,
      addStopRate: 5.0,
      defaultRadiusMiles: 30,
      maxNotifyDrivers: 200,
    });
  }
  return cfg;
};

module.exports = mongoose.model("RideConfig", RideConfigSchema);
