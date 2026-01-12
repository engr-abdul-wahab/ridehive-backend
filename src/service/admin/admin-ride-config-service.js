const RideConfig = require("../../models/RideConfig");

class AdminRideConfigService {
  constructor() {}

  // fetch singleton config
  async getConfig() {
    return await RideConfig.getConfig();
  }

  // update singleton config
  async updateConfig(updates = {}, adminId = null) {
    const allowed = [
      "carStandardRate",
      "carDeluxeRate",
      "motorcycleStandardRate",
      "courierFoodRate",
      "addStopRate",
      "defaultRadiusMiles",
      "maxNotifyDrivers",
    ];

    const payload = {};
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(updates, k)) payload[k] = updates[k];
    }

    if (Object.keys(payload).length === 0) {
      const e = new Error("No valid fields to update");
      e.statusCode = 400;
      throw e;
    }

    // validate numbers
    for (const k of Object.keys(payload)) {
      if (payload[k] === null || payload[k] === undefined || isNaN(Number(payload[k]))) {
        const e = new Error(`${k} must be a valid number`);
        e.statusCode = 400;
        throw e;
      }
    }

    payload.updatedBy = adminId ?? null;
    const opts = { new: true };
    const cfg = await RideConfig.findOneAndUpdate({}, { $set: payload }, opts).lean().exec();
    return cfg;
  }
}

module.exports = new AdminRideConfigService();
