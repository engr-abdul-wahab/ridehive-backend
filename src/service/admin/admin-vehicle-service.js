const Vehicle = require("../../models/Vehicle");
const User = require("../../models/User");
const mongoose = require("mongoose");
const { buildProfileImageUrl } = require("../../utils/profile-image");

class VehicleService {
  // List vehicles with search and pagination
  async listVehicles({ page = 1, limit = 25, search = "" }) {
    const skip = (page - 1) * limit;

    // Base aggregation
    const pipeline = [
      // 1. Join drivers
      {
        $lookup: {
          from: "users",
          localField: "driver",
          foreignField: "_id",
          as: "driver",
        },
      },
      { $unwind: "$driver" },
    ];

    // 2. Add search stage if search query exists
    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { licensePlateNumber: { $regex: search, $options: "i" } },
            { "driver.fullName": { $regex: search, $options: "i" } },
            { "driver.email": { $regex: search, $options: "i" } },
            { "driver.phone": { $regex: search, $options: "i" } },
          ],
        },
      });
    }

    // 3. Project required fields
    pipeline.push({
      $project: {
        _id: 1,
        carMakeModel: 1,
        licensePlateNumber: 1,
        color: 1,
        specification: 1,
        vehicleType: 1,
        rideOption: 1,
        licensePlateKey: 1,
        vehiclePictureKey: 1,
        driverLicenseKey: 1,
        vehicleRegistrationKey: 1,
        taxiOperatorLicenseKey: 1,
        insuranceCardKey: 1,
        "driver.fullName": 1,
        "driver.email": 1,
        "driver.phone": 1,
        "driver.gender": 1,
        "driver.profileImageKey": 1,
      },
    });

    // 4. Pagination
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: Number(limit) });

    // Execute aggregation
    const vehicles = await Vehicle.aggregate(pipeline);

    // Count total documents for pagination
    const total = await Vehicle.countDocuments();
    const pages = Math.ceil(total / limit);

    // Convert keys to full URLs and remove keys
    const items = vehicles.map((v) => ({
      _id: v._id,
      carMakeModel: v.carMakeModel,
      licensePlateNumber: v.licensePlateNumber,
      color: v.color,
      specification: v.specification,
      vehicleType: v.vehicleType,
      rideOption: v.rideOption,
      licensePlateUrl: buildProfileImageUrl(v.licensePlateKey),
      vehiclePictureUrl: buildProfileImageUrl(v.vehiclePictureKey),
      driverLicenseUrl: buildProfileImageUrl(v.driverLicenseKey),
      vehicleRegistrationUrl: buildProfileImageUrl(v.vehicleRegistrationKey),
      taxiOperatorLicenseUrl: buildProfileImageUrl(v.taxiOperatorLicenseKey),
      insuranceCardUrl: buildProfileImageUrl(v.insuranceCardKey),
      driver: {
        fullName: v.driver.fullName,
        email: v.driver.email,
        phone: v.driver.phone,
        gender: v.driver.gender,
        profileImageUrl: buildProfileImageUrl(v.driver.profileImageKey),
      },
    }));

    return { meta: { page, limit, total, pages }, items };
  }

  // View single vehicle
  async getVehicle(vehicleId) {
    if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
      const e = new Error("Invalid vehicle id");
      e.statusCode = 400;
      throw e;
    }

    const vehicle = await Vehicle.findById(vehicleId).populate("driver").lean();
    if (!vehicle) {
      const e = new Error("Vehicle not found");
      e.statusCode = 404;
      throw e;
    }

    return {
      _id: vehicle._id,
      carMakeModel: vehicle.carMakeModel,
      licensePlateNumber: vehicle.licensePlateNumber,
      color: vehicle.color,
      specification: vehicle.specification,
      vehicleType: vehicle.vehicleType,
      rideOption: vehicle.rideOption,
      licensePlateUrl: buildProfileImageUrl(vehicle.licensePlateKey),
      vehiclePictureUrl: buildProfileImageUrl(vehicle.vehiclePictureKey),
      driverLicenseUrl: buildProfileImageUrl(vehicle.driverLicenseKey),
      vehicleRegistrationUrl: buildProfileImageUrl(
        vehicle.vehicleRegistrationKey
      ),
      taxiOperatorLicenseUrl: buildProfileImageUrl(
        vehicle.taxiOperatorLicenseKey
      ),
      insuranceCardUrl: buildProfileImageUrl(vehicle.insuranceCardKey),
      driver: {
        fullName: vehicle.driver.fullName,
        email: vehicle.driver.email,
        phone: vehicle.driver.phone,
        gender: vehicle.driver.gender,
        profileImageUrl: buildProfileImageUrl(vehicle.driver.profileImageKey),
      },
    };
  }

  // Update vehicle info
  async updateVehicle(vehicleId, updates = {}, files = {}) {
    if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
      const e = new Error("Invalid vehicle id");
      e.statusCode = 400;
      throw e;
    }

    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      const e = new Error("Vehicle not found");
      e.statusCode = 404;
      throw e;
    }

    // Allowed fields to update
    const allowedFields = [
      "carMakeModel",
      "licensePlateNumber",
      "color",
      "specification",
      "vehicleType",
      "rideOption",
    ];

    allowedFields.forEach((field) => {
      if (updates[field] !== undefined) vehicle[field] = updates[field];
    });

    // Files
    if (files.licensePlate) vehicle.licensePlateKey = files.licensePlate[0].key;
    if (files.vehiclePicture)
      vehicle.vehiclePictureKey = files.vehiclePicture[0].key;
    if (files.driverLicense)
      vehicle.driverLicenseKey = files.driverLicense[0].key;
    if (files.vehicleRegistration)
      vehicle.vehicleRegistrationKey = files.vehicleRegistration[0].key;
    if (files.taxiOperatorLicense)
      vehicle.taxiOperatorLicenseKey = files.taxiOperatorLicense[0].key;
    if (files.insuranceCard)
      vehicle.insuranceCardKey = files.insuranceCard[0].key;

    // Save without triggering required validation
    await vehicle.save({ validateBeforeSave: false });

    // Return full vehicle info with URLs
    return this.getVehicle(vehicleId);
  }
}

module.exports = new VehicleService();
