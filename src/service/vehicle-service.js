// src/service/vehicle-service.js
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const Vehicle = require("../models/Vehicle");
const User = require("../models/User");
const { s3Utils } = require("../config/aws-s3");
const { handlers } = require("../utils/handlers");
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2022-11-15",
});

const APP_BASE_URL = process.env.APP_BASE_URL || "";

const ALLOWED_RIDE_OPTIONS = [
  "car_standard",
  "car_deluxe",
  "motorcycle_standard",
];

class VehicleService {
  // helper: determine if a stored key is local (uploads/) or S3
  isLocalKey(key) {
    if (!key || typeof key !== "string") return false;
    return key.startsWith("uploads/");
  }

  // helper: build public URL for a key (local or s3)
  buildFileUrl(key) {
    if (!key) return null;
    // treat non-string defensively
    const k = String(key).trim();
    // If it's already a full URL (http(s):// or protocol-relative //) return as-is
    if (/^(https?:)?\/\//i.test(k)) {
      return k;
    }
    if (this.isLocalKey(k)) {
      // ensure no double slashes
      return `${APP_BASE_URL.replace(/\/$/, "")}/${k.replace(/^\/+/, "")}`;
    }
    // S3 key
    if (s3Utils && typeof s3Utils.getFileUrl === "function") {
      try {
        return s3Utils.getFileUrl(k);
      } catch (e) {
        // fallback null on error
        console.error("s3Utils.getFileUrl failed", e);
        return null;
      }
    }
    return null;
  }

  // helper: delete a key (supports S3 and local)
  async deleteKeyIfExists(key) {
    if (!key) return;
    try {
      if (this.isLocalKey(key)) {
        // local path like 'uploads/images/xxx.jpg'
        const localPath = path.join(process.cwd(), key.replace(/^\/+/, ""));
        if (fs.existsSync(localPath)) {
          fs.unlinkSync(localPath);
        }
      } else {
        // attempt S3 delete if configured
        if (s3Utils && typeof s3Utils.deleteFile === "function") {
          await s3Utils.deleteFile(key);
        }
      }
    } catch (e) {
      // non-fatal; log
      handlers.logger?.error
        ? handlers.logger.error({
            object_type: "s3/delete-or-local-delete",
            message: "Failed to delete key",
            data: { key, err: e.message },
          })
        : console.error("Failed to delete key", key, e);
    }
  }

  // helper: extract normalized key from files object for a given field
  // `files` is expected as object: { fieldname: [file, ...], ... } (multer.fields) or array from any()
  // file may contain: .key (s3 or local key), .location, .path, .filename + .destination
  extractKeyFromFiles(files, field) {
    if (!files) return null;

    // if files is array (e.g. upload.any()) find first item with matching fieldname
    if (Array.isArray(files)) {
      const found = files.find((f) => f.fieldname === field);
      if (!found) return null;
      return (
        found.key ||
        (found.location
          ? found.location
          : found.path
          ? this.makeLocalKey(found.path)
          : null)
      );
    }

    // files as object (multer.fields or baseMulter.any with grouping)
    if (Object.prototype.hasOwnProperty.call(files, field)) {
      const arr = files[field];
      if (Array.isArray(arr) && arr.length > 0) {
        const f = arr[0];
        return (
          f.key || f.location || (f.path ? this.makeLocalKey(f.path) : null)
        );
      }
      return null;
    }

    // fallback: maybe files contains single file at files.file
    if (
      files &&
      files[field] &&
      Array.isArray(files[field]) &&
      files[field].length > 0
    ) {
      const f = files[field][0];
      return f.key || f.location || (f.path ? this.makeLocalKey(f.path) : null);
    }

    return null;
  }

  // helper: build local key from absolute path (if needed)
  makeLocalKey(absPath) {
    if (!absPath) return null;
    const rel = path.relative(process.cwd(), absPath).replace(/\\/g, "/");
    return rel.startsWith("uploads/") ? rel : `uploads/${rel}`;
  }

  // Create or update vehicle
  async createVehicle(data) {
    const { user, body = {}, files = {} } = data;

    // AUTH & ROLE
    if (!user || !user.id) {
      const err = new Error("Unauthorized");
      err.statusCode = 401;
      throw err;
    }
    if (user.role !== "driver") {
      const err = new Error("Only drivers can add/update vehicle details");
      err.statusCode = 403;
      throw err;
    }
    if (!mongoose.Types.ObjectId.isValid(user.id)) {
      const err = new Error("Invalid user id");
      err.statusCode = 400;
      throw err;
    }

    // FIELDS (validated by vehicle-validation but double-check)
    const carMakeModel = body.carMakeModel && String(body.carMakeModel).trim();
    const color = body.color && String(body.color).trim();
    const specification = body.specification
      ? String(body.specification).trim()
      : "";
    const vehicleType = body.vehicleType ? String(body.vehicleType).trim() : "";
    const licensePlateNumber = body.licensePlateNumber
      ? String(body.licensePlateNumber).trim()
      : "";
    const rideOption = body.rideOption ? String(body.rideOption).trim() : null;

    if (!carMakeModel || !color || !rideOption) {
      const err = new Error("Missing required fields");
      err.statusCode = 400;
      throw err;
    }
    if (!ALLOWED_RIDE_OPTIONS.includes(rideOption)) {
      const err = new Error("Invalid rideOption");
      err.statusCode = 400;
      throw err;
    }

    // Normalize incoming file keys (works with multer middleware that sets .key or local fallback)
    const newKeys = {
      licensePlateKey: this.extractKeyFromFiles(files, "licensePlate"),
      vehiclePictureKey: this.extractKeyFromFiles(files, "vehiclePicture"),
      driverLicenseKey: this.extractKeyFromFiles(files, "driverLicense"),
      vehicleRegistrationKey: this.extractKeyFromFiles(
        files,
        "vehicleRegistration"
      ),
      taxiOperatorLicenseKey: this.extractKeyFromFiles(
        files,
        "taxiOperatorLicense"
      ),
      insuranceCardKey: this.extractKeyFromFiles(files, "insuranceCard"),
    };

    // find existing vehicle
    let vehicle = await Vehicle.findOne({ driver: user.id }).exec();

    // If updating, delete replaced files (both local and S3 as appropriate)
    const deleteIfReplaced = async (oldKey, newKey) => {
      if (oldKey && newKey && oldKey !== newKey) {
        await this.deleteKeyIfExists(oldKey);
      }
    };

    if (!vehicle) {
      vehicle = new Vehicle({
        driver: user.id,
        carMakeModel,
        color,
        specification,
        vehicleType,
        licensePlateNumber,
        rideOption,
        licensePlateKey: newKeys.licensePlateKey,
        vehiclePictureKey: newKeys.vehiclePictureKey,
        driverLicenseKey: newKeys.driverLicenseKey,
        vehicleRegistrationKey: newKeys.vehicleRegistrationKey,
        taxiOperatorLicenseKey: newKeys.taxiOperatorLicenseKey,
        insuranceCardKey: newKeys.insuranceCardKey,
      });
    } else {
      // update textual fields
      vehicle.carMakeModel = carMakeModel;
      vehicle.color = color;
      vehicle.specification = specification || vehicle.specification;
      vehicle.vehicleType = vehicleType || vehicle.vehicleType;
      vehicle.licensePlateNumber =
        licensePlateNumber || vehicle.licensePlateNumber;
      vehicle.rideOption = rideOption;

      // delete old files if replaced
      await deleteIfReplaced(vehicle.licensePlateKey, newKeys.licensePlateKey);
      await deleteIfReplaced(
        vehicle.vehiclePictureKey,
        newKeys.vehiclePictureKey
      );
      await deleteIfReplaced(
        vehicle.driverLicenseKey,
        newKeys.driverLicenseKey
      );
      await deleteIfReplaced(
        vehicle.vehicleRegistrationKey,
        newKeys.vehicleRegistrationKey
      );
      await deleteIfReplaced(
        vehicle.taxiOperatorLicenseKey,
        newKeys.taxiOperatorLicenseKey
      );
      await deleteIfReplaced(
        vehicle.insuranceCardKey,
        newKeys.insuranceCardKey
      );

      // set new keys if provided
      if (newKeys.licensePlateKey)
        vehicle.licensePlateKey = newKeys.licensePlateKey;
      if (newKeys.vehiclePictureKey)
        vehicle.vehiclePictureKey = newKeys.vehiclePictureKey;
      if (newKeys.driverLicenseKey)
        vehicle.driverLicenseKey = newKeys.driverLicenseKey;
      if (newKeys.vehicleRegistrationKey)
        vehicle.vehicleRegistrationKey = newKeys.vehicleRegistrationKey;
      if (newKeys.taxiOperatorLicenseKey)
        vehicle.taxiOperatorLicenseKey = newKeys.taxiOperatorLicenseKey;
      if (newKeys.insuranceCardKey)
        vehicle.insuranceCardKey = newKeys.insuranceCardKey;
    }

    await vehicle.save();

    // After save, mark user's vehicleDetails flag true and get updated user object
    let userObj = null;
    try {
      const updatedUser = await User.findByIdAndUpdate(
        user.id,
        { vehicleDetails: true },
        { new: true }
      ).exec();

      if (updatedUser) {
        userObj = updatedUser.toObject
          ? updatedUser.toObject()
          : JSON.parse(JSON.stringify(updatedUser));
        if (userObj.password) delete userObj.password;
        if (userObj.lastAuthToken) delete userObj.lastAuthToken;
        if (userObj.__v !== undefined) delete userObj.__v;
        // --- add computed profileImageUrl like createProfile ---
        try {
          // buildFileUrl already handles full URLs, local keys and S3 keys
          userObj.profileImageUrl = userObj.profileImageKey
            ? this.buildFileUrl(userObj.profileImageKey)
            : null;
        } catch (e) {
          console.error("Failed to compute profileImageUrl (non-fatal):", e);
          userObj.profileImageUrl = null;
        }
      }
    } catch (e) {
      // non-fatal; log and continue
      handlers.logger?.error
        ? handlers.logger.error({
            object_type: "user.update",
            message: "Failed to set vehicleDetails true",
            data: { userId: user.id, err: e.message },
          })
        : console.error("Failed to set vehicleDetails true", e);
    }

    // build response with public/presigned URLs via s3Utils.getFileUrl or local URLs
    const fileUrl = (key) => (key ? this.buildFileUrl(key) : null);

    // // Retrieve Stripe account and check transfers capability
    // const account = await stripe.accounts.retrieve(userObj.stripeAccountId);
    // const transfersCapability =
    //   account.capabilities && account.capabilities.transfers;
    // let onboardingUrl = null;
    // if (transfersCapability !== "active") {
    //   try {
    //     const accountLink = await stripe.accountLinks.create({
    //       account: userObj.stripeAccountId,
    //       refresh_url: `${process.env.APP_BASE_URL}/merchant/setup`,
    //       return_url: `${process.env.APP_BASE_URL}/merchant/thank-you`,
    //       type: "account_onboarding",
    //     });
    //     onboardingUrl = accountLink;
    //   } catch (linkErr) {
    //     // If creation of account link fails, still treat as incomplete but set onboardingUrl null
    //     console.error(
    //       "Failed to create Stripe account link:",
    //       linkErr && linkErr.message ? linkErr.message : linkErr
    //     );
    //   }
    // }

    // --- safer Stripe onboarding handling ---
    let onboardingUrl = null;

    try {
      // only attempt if we have a user object and a stripeAccountId
      if (userObj && userObj.stripeAccountId) {
        const account = await stripe.accounts.retrieve(userObj.stripeAccountId);

        const transfersCapability =
          account && account.capabilities
            ? account.capabilities.transfers
            : null;

        if (transfersCapability !== "active") {
          try {
            const accountLink = await stripe.accountLinks.create({
              account: userObj.stripeAccountId,
              refresh_url: `${process.env.APP_BASE_URL}/merchant/setup`,
              return_url: `${process.env.APP_BASE_URL}/merchant/thank-you`,
              type: "account_onboarding",
            });
            // store the whole object, but be defensive
            onboardingUrl = accountLink || null;
          } catch (linkErr) {
            // log and keep onboardingUrl null
            console.error(
              "Failed to create Stripe account link:",
              linkErr && linkErr.message ? linkErr.message : linkErr
            );
            onboardingUrl = null;
          }
        }
      } else {
        // missing userObj or stripeAccountId: log for debugging
        console.warn(
          "Skipping Stripe retrieve: missing userObj or stripeAccountId",
          {
            userObjExists: !!userObj,
            stripeAccountId: userObj ? userObj.stripeAccountId : null,
          }
        );
      }
    } catch (acctErr) {
      console.error(
        "Failed to retrieve Stripe account:",
        acctErr && acctErr.message ? acctErr.message : acctErr
      );
      onboardingUrl = null;
    }

    const response = {
      vehicleId: vehicle._id,
      carMakeModel: vehicle.carMakeModel,
      color: vehicle.color,
      specification: vehicle.specification,
      vehicleType: vehicle.vehicleType || null,
      licensePlateNumber: vehicle.licensePlateNumber || null,
      rideOption: vehicle.rideOption,
      files: {
        licensePlate: fileUrl(vehicle.licensePlateKey),
        vehiclePicture: fileUrl(vehicle.vehiclePictureKey),
        driverLicense: fileUrl(vehicle.driverLicenseKey),
        vehicleRegistration: fileUrl(vehicle.vehicleRegistrationKey),
        taxiOperatorLicense: fileUrl(vehicle.taxiOperatorLicenseKey),
        insuranceCard: fileUrl(vehicle.insuranceCardKey),
      },
      user: userObj,
      onboardingUrl:
        onboardingUrl && onboardingUrl.url ? onboardingUrl.url : null,
    };

    handlers.logger.success({
      object_type: "vehicle.service",
      message: "Vehicle saved",
      data: { driver: user.id, vehicleId: vehicle._id },
    });

    return { message: "Vehicle details saved successfully", data: response };
  }

  // MAIN: updateVehicle (partial update, no required validation)
  async updateVehicle(data) {
    const { user, body = {}, files = {} } = data;

    // AUTH & ROLE
    if (!user || !user.id) {
      const err = new Error("Unauthorized");
      err.statusCode = 401;
      throw err;
    }
    if (user.role !== "driver") {
      const err = new Error("Only drivers can update vehicle details");
      err.statusCode = 403;
      throw err;
    }
    if (!mongoose.Types.ObjectId.isValid(user.id)) {
      const err = new Error("Invalid user id");
      err.statusCode = 400;
      throw err;
    }

    // Find existing vehicle for driver
    const vehicle = await Vehicle.findOne({ driver: user.id }).exec();
    if (!vehicle) {
      const err = new Error("Vehicle not found for this driver");
      err.statusCode = 404;
      throw err;
    }

    // Partial textual updates: update only when provided (even empty string allowed to clear)
    if (body.carMakeModel !== undefined)
      vehicle.carMakeModel = String(body.carMakeModel).trim();
    if (body.color !== undefined) vehicle.color = String(body.color).trim();
    if (body.specification !== undefined)
      vehicle.specification = String(body.specification).trim();
    if (body.vehicleType !== undefined)
      vehicle.vehicleType = String(body.vehicleType).trim();
    if (body.licensePlateNumber !== undefined)
      vehicle.licensePlateNumber = String(body.licensePlateNumber).trim();
    if (body.rideOption !== undefined)
      vehicle.rideOption = String(body.rideOption).trim();

    // Normalize incoming file keys (works with multer that sets .key/location/path)
    const incomingKeys = {
      licensePlateKey: this.extractKeyFromFiles(files, "licensePlate"),
      vehiclePictureKey: this.extractKeyFromFiles(files, "vehiclePicture"),
      driverLicenseKey: this.extractKeyFromFiles(files, "driverLicense"),
      vehicleRegistrationKey: this.extractKeyFromFiles(
        files,
        "vehicleRegistration"
      ),
      taxiOperatorLicenseKey: this.extractKeyFromFiles(
        files,
        "taxiOperatorLicense"
      ),
      insuranceCardKey: this.extractKeyFromFiles(files, "insuranceCard"),
    };

    // Delete old files when replaced
    const deleteIfReplaced = async (oldKey, newKey) => {
      if (oldKey && newKey && oldKey !== newKey) {
        await this.deleteKeyIfExists(oldKey);
      }
    };

    await deleteIfReplaced(
      vehicle.licensePlateKey,
      incomingKeys.licensePlateKey
    );
    await deleteIfReplaced(
      vehicle.vehiclePictureKey,
      incomingKeys.vehiclePictureKey
    );
    await deleteIfReplaced(
      vehicle.driverLicenseKey,
      incomingKeys.driverLicenseKey
    );
    await deleteIfReplaced(
      vehicle.vehicleRegistrationKey,
      incomingKeys.vehicleRegistrationKey
    );
    await deleteIfReplaced(
      vehicle.taxiOperatorLicenseKey,
      incomingKeys.taxiOperatorLicenseKey
    );
    await deleteIfReplaced(
      vehicle.insuranceCardKey,
      incomingKeys.insuranceCardKey
    );

    // Set new keys when provided
    if (incomingKeys.licensePlateKey)
      vehicle.licensePlateKey = incomingKeys.licensePlateKey;
    if (incomingKeys.vehiclePictureKey)
      vehicle.vehiclePictureKey = incomingKeys.vehiclePictureKey;
    if (incomingKeys.driverLicenseKey)
      vehicle.driverLicenseKey = incomingKeys.driverLicenseKey;
    if (incomingKeys.vehicleRegistrationKey)
      vehicle.vehicleRegistrationKey = incomingKeys.vehicleRegistrationKey;
    if (incomingKeys.taxiOperatorLicenseKey)
      vehicle.taxiOperatorLicenseKey = incomingKeys.taxiOperatorLicenseKey;
    if (incomingKeys.insuranceCardKey)
      vehicle.insuranceCardKey = incomingKeys.insuranceCardKey;

    await vehicle.save();

    // Build public URLs for files
    const fileUrl = (key) => (key ? this.buildFileUrl(key) : null);

    const response = {
      vehicleId: vehicle._id,
      driver: vehicle.driver, // id only if you want it; you said "do not want user object" — this is just id
      carMakeModel: vehicle.carMakeModel,
      color: vehicle.color,
      specification: vehicle.specification,
      vehicleType: vehicle.vehicleType || null,
      licensePlateNumber: vehicle.licensePlateNumber || null,
      rideOption: vehicle.rideOption || null,
      files: {
        licensePlate: {
          key: vehicle.licensePlateKey || null,
          url: fileUrl(vehicle.licensePlateKey),
        },
        vehiclePicture: {
          key: vehicle.vehiclePictureKey || null,
          url: fileUrl(vehicle.vehiclePictureKey),
        },
        driverLicense: {
          key: vehicle.driverLicenseKey || null,
          url: fileUrl(vehicle.driverLicenseKey),
        },
        vehicleRegistration: {
          key: vehicle.vehicleRegistrationKey || null,
          url: fileUrl(vehicle.vehicleRegistrationKey),
        },
        taxiOperatorLicense: {
          key: vehicle.taxiOperatorLicenseKey || null,
          url: fileUrl(vehicle.taxiOperatorLicenseKey),
        },
        insuranceCard: {
          key: vehicle.insuranceCardKey || null,
          url: fileUrl(vehicle.insuranceCardKey),
        },
      },
    };

    handlers.logger?.success
      ? handlers.logger.success({
          object_type: "vehicle.service.update",
          message: "Vehicle updated",
          data: { driver: user.id, vehicleId: vehicle._id },
        })
      : console.log("Vehicle updated", {
          driver: user.id,
          vehicleId: vehicle._id,
        });

    return { message: "Vehicle updated successfully", data: response };
  }

  async getVehicleByDriver(data) {
    const { user } = data;
    if (!user || !user.id) {
      const err = new Error("Unauthorized");
      err.statusCode = 401;
      throw err;
    }
    if (!mongoose.Types.ObjectId.isValid(user.id)) {
      const err = new Error("Invalid user id");
      err.statusCode = 400;
      throw err;
    }

    const vehicle = await Vehicle.findOne({ driver: user.id }).exec();
    if (!vehicle) {
      const err = new Error("No vehicle found");
      err.statusCode = 404;
      throw err;
    }

    const fileUrl = (key) => (key ? this.buildFileUrl(key) : null);

    // fetch user details to include in response (exclude password)
    // let userObj = null;
    // try {
    //   const dbUser = await User.findById(user.id).exec();
    //   if (dbUser) {
    //     userObj = dbUser.toObject
    //       ? dbUser.toObject()
    //       : JSON.parse(JSON.stringify(dbUser));
    //     if (userObj.password) delete userObj.password;
    //     if (userObj.lastAuthToken) delete userObj.lastAuthToken;
    //     if (userObj.__v !== undefined) delete userObj.__v;
    //     // --- add computed profileImageUrl ---
    //     try {
    //       userObj.profileImageUrl = userObj.profileImageKey
    //         ? this.buildFileUrl(userObj.profileImageKey)
    //         : null;
    //     } catch (e) {
    //       console.error("Failed to compute profileImageUrl (non-fatal):", e);
    //       userObj.profileImageUrl = null;
    //     }
    //   }
    // } catch (e) {
    //   handlers.logger?.error
    //     ? handlers.logger.error({
    //         object_type: "user.fetch",
    //         message: "Failed to fetch user for response",
    //         data: { userId: user.id, err: e.message },
    //       })
    //     : console.error("Failed to fetch user for response", e);
    // }

    const response = {
      vehicleId: vehicle._id,
      carMakeModel: vehicle.carMakeModel,
      color: vehicle.color,
      specification: vehicle.specification,
      vehicleType: vehicle.vehicleType || null,
      licensePlateNumber: vehicle.licensePlateNumber || null,
      rideOption: vehicle.rideOption,
      files: {
        licensePlate: fileUrl(vehicle.licensePlateKey),
        vehiclePicture: fileUrl(vehicle.vehiclePictureKey),
        driverLicense: fileUrl(vehicle.driverLicenseKey),
        vehicleRegistration: fileUrl(vehicle.vehicleRegistrationKey),
        taxiOperatorLicense: fileUrl(vehicle.taxiOperatorLicenseKey),
        insuranceCard: fileUrl(vehicle.insuranceCardKey),
      },
      // user: userObj,
    };

    return { message: "Vehicle found", data: response };
  }
}

module.exports = new VehicleService();
