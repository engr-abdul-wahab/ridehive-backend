// src/service/profile-service.js
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const User = require("../models/User");
const { s3Utils } = require("../config/aws-s3");
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2022-11-15",
});

const APP_BASE_URL = process.env.APP_BASE_URL || "";
const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 10);

class ProfileService {
  /**
   * data: { body, file, user, ip, userAgent }
   * expects req.user to contain authenticated user info (id, role, email)
   */
  async createProfile(data) {
    const { body = {}, file = null, user = null, ip } = data;
    console.log("IP :" + ip);

    // Resolve acting user id
    const actingUserId = (user && (user.id || user._id)) || body.userId;
    if (!actingUserId || !mongoose.Types.ObjectId.isValid(actingUserId)) {
      const err = new Error("Invalid or missing authenticated user");
      err.statusCode = 401;
      throw err;
    }

    // Find user in DB
    const dbUser = await User.findById(actingUserId).exec();
    if (!dbUser) {
      const err = new Error("User not found");
      err.statusCode = 404;
      throw err;
    }

    // Parse and normalize inputs
    const fullName = body.fullName
      ? String(body.fullName).trim()
      : dbUser.fullName;
    const phone = body.phone ? String(body.phone).trim() : dbUser.phone;
    const gender = body.gender ? String(body.gender).trim() : dbUser.gender;
    const bio = body.bio ? String(body.bio).trim() : dbUser.bio;

    // location may come as JSON string when using multipart/form-data
    let locationInput = body.location;
    let locationObj = null;
    try {
      locationObj =
        typeof locationInput === "string"
          ? JSON.parse(locationInput)
          : locationInput;
    } catch (e) {
      const err = new Error("Invalid location format");
      err.statusCode = 400;
      throw err;
    }

    // Validate minimal location fields
    if (
      !locationObj ||
      !locationObj.address ||
      locationObj.lat === undefined ||
      locationObj.lat === null ||
      locationObj.lng === undefined ||
      locationObj.lng === null
    ) {
      const err = new Error("Location must include address, lat and lng");
      err.statusCode = 400;
      throw err;
    }

    // ------------- handle profile image -------------
    // Accepts S3 key (e.g. 'Asuba-Connection-Uploads/...') OR local key (e.g. 'uploads/images/...')
    let newProfileImageKey = null;
    if (file) {
      if (file.key && typeof file.key === "string" && file.key.length > 0) {
        newProfileImageKey = file.key;
      } else if (file.path) {
        const rel = path.relative(process.cwd(), file.path).replace(/\\/g, "/");
        newProfileImageKey = rel.startsWith("uploads/")
          ? rel
          : `uploads/${rel}`;
      } else if (file.filename && file.destination) {
        const rel = path
          .relative(process.cwd(), path.join(file.destination, file.filename))
          .replace(/\\/g, "/");
        newProfileImageKey = rel.startsWith("uploads/")
          ? rel
          : `uploads/${rel}`;
      } else {
        const ext = path.extname(file.originalname || "") || "";
        newProfileImageKey = `uploads/images/${Date.now()}-${Math.random()
          .toString(36)
          .substring(2)}${ext}`;
      }
    }

    // ------------- Stripe logic -------------
    let stripeCustomerId = dbUser.stripeCustomerId || null;
    let stripeAccountId = dbUser.stripeAccountId || null;

    const role = body.role || dbUser.role || "user";

    // Create stripe customer for 'user'
    if (role === "user" && !stripeCustomerId) {
      try {
        const customer = await stripe.customers.create({
          email: dbUser.email,
          name: fullName || dbUser.fullName || undefined,
        });
        stripeCustomerId = customer.id;
      } catch (e) {
        console.error("Stripe customer create failed", e);
      }
    }

    // Create connect account for 'driver'
    if (role === "driver" && !stripeAccountId) {
      try {
        const account = await stripe.accounts.create({
          type: "express",
          country: process.env.STRIPE_DEFAULT_COUNTRY || "US",
          email: dbUser.email,
          business_type: "individual",
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
        });
        stripeAccountId = account.id;
      } catch (e) {
        console.error("Stripe account create failed", e);
      }
    }

    // ------------- Delete previous image if replaced (S3 or local) -------------
    const previousKey = dbUser.profileImageKey;
    if (
      newProfileImageKey &&
      previousKey &&
      previousKey !== newProfileImageKey
    ) {
      try {
        const looksLikeLocal = String(previousKey).startsWith("uploads/");
        if (!looksLikeLocal) {
          // Attempt to delete from S3 if s3Utils configured
          if (
            s3Utils &&
            typeof s3Utils.isConfigured === "function" &&
            s3Utils.isConfigured()
          ) {
            if (typeof s3Utils.deleteFile === "function") {
              await s3Utils.deleteFile(previousKey).catch((e) => {
                console.error("S3 deleteFile failed (non-fatal):", e);
              });
            }
          }
        } else {
          // previousKey is local file path -> delete the file from disk
          try {
            const localPath = path.join(
              process.cwd(),
              previousKey.replace(/^\/+/, "")
            );
            if (fs.existsSync(localPath)) {
              fs.unlinkSync(localPath);
            }
          } catch (e) {
            console.error(
              "Failed to delete previous local file (non-fatal):",
              e
            );
          }
        }
      } catch (e) {
        // Non-fatal; log and continue
        console.error(
          "Error while attempting to remove previous profile image (non-fatal):",
          e
        );
      }
    }

    // ------------- Prepare location GeoJSON -------------
    const latNum = Number(locationObj.lat);
    const lngNum = Number(locationObj.lng);

    if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
      const err = new Error("Location lat and lng must be numeric");
      err.statusCode = 400;
      throw err;
    }

    const locationToSave = {
      type: "Point",
      coordinates: [lngNum, latNum],
      address: locationObj.address,
    };

    // ------------- Save to DB -------------
    dbUser.fullName = fullName || dbUser.fullName;
    dbUser.phone = phone || dbUser.phone;
    dbUser.gender = gender || dbUser.gender;
    dbUser.bio = bio || dbUser.bio;
    dbUser.location = locationToSave;
    if (newProfileImageKey) dbUser.profileImageKey = newProfileImageKey;
    if (stripeCustomerId) dbUser.stripeCustomerId = stripeCustomerId;
    if (stripeAccountId) dbUser.stripeAccountId = stripeAccountId;
    dbUser.profileCompleted = true;

    await dbUser.save();

    // ------------- Build profileImageUrl -------------
    let profileImageUrl = null;
    if (dbUser.profileImageKey) {
      const key = String(dbUser.profileImageKey);
      // true for "http://...", "https://..." and "//example.com/..."
      const looksLikeFullUrl = /^(https?:)?\/\//i.test(key);
      const looksLikeLocal = key.startsWith("uploads/");

      if (looksLikeFullUrl) {
        // already a full URL — use as-is
        profileImageUrl = key;
      } else if (
        !looksLikeLocal &&
        s3Utils &&
        typeof s3Utils.isConfigured === "function" &&
        s3Utils.isConfigured()
      ) {
        // not a local path and S3 is configured — ask s3Utils for a URL
        try {
          profileImageUrl =
            typeof s3Utils.getFileUrl === "function"
              ? s3Utils.getFileUrl(key)
              : null;
        } catch (e) {
          console.error("s3Utils.getFileUrl failed (non-fatal):", e);
          profileImageUrl = null;
        }
      } else {
        // local file -> build URL from APP_BASE_URL
        profileImageUrl = `${APP_BASE_URL}/${key}`.replace(
          /([^:]\/)\/+/g,
          "$1"
        );
      }
    }

    // ------------- Build response user object (exclude password) -------------
    // Use lean-ish conversion so we don't accidentally send mongoose internals
    const userObj = dbUser.toObject
      ? dbUser.toObject()
      : JSON.parse(JSON.stringify(dbUser));

    // remove sensitive fields
    if (userObj.password) delete userObj.password;
    if (userObj.lastAuthToken) delete userObj.lastAuthToken;
    if (userObj.__v !== undefined) delete userObj.__v;

    // Always include profileImageUrl in response (computed above)
    userObj.profileImageUrl = profileImageUrl;

    // Add stripe id fields according to role rules:
    // - role === 'user'  => include stripeCustomerId only
    // - role === 'driver' => include stripeAccountId only
    // - role === 'admin' => include neither
    if (role === "user") {
      userObj.stripeCustomerId = dbUser.stripeCustomerId || null;
      // remove account id if present
      if (userObj.stripeAccountId) delete userObj.stripeAccountId;
    } else if (role === "driver") {
      userObj.stripeAccountId = dbUser.stripeAccountId || null;
      if (userObj.stripeCustomerId) delete userObj.stripeCustomerId;
    } else {
      // admin or other roles - remove both to follow the rule
      if (userObj.stripeCustomerId) delete userObj.stripeCustomerId;
      if (userObj.stripeAccountId) delete userObj.stripeAccountId;
    }

    // Determine next route for frontend redirection
    let next = "/home";
    if (role === "driver") next = "/vehicle-details";
    if (role === "admin") next = "/home";

    const responseData = {
      user: userObj,
      next,
    };

    return {
      message: "Profile created/updated successfully",
      data: responseData,
    };
  }

  async updateProfile(data) {
    const { body = {}, file = null, user = null, ip } = data;

    // Resolve acting user id - authenticated user preferred
    const actingUserId = (user && (user.id || user._id)) || body.userId;
    if (!actingUserId || !mongoose.Types.ObjectId.isValid(actingUserId)) {
      const err = new Error("Invalid or missing authenticated user");
      err.statusCode = 401;
      throw err;
    }

    // Find user
    const dbUser = await User.findById(actingUserId).exec();
    if (!dbUser) {
      const err = new Error("User not found");
      err.statusCode = 404;
      throw err;
    }

    // ---- Partial updates: only update when fields provided (even empty string -> preserve previous unless explicitly blank allowed) ----
    if (body.fullName !== undefined) {
      const v = String(body.fullName).trim();
      if (v.length) dbUser.fullName = v;
      else dbUser.fullName = ""; // allow clearing name if client intentionally sends empty string
    }

    if (body.phone !== undefined) {
      const v = String(body.phone).trim();
      dbUser.phone = v.length ? v : "";
    }

    if (body.gender !== undefined) {
      const v = String(body.gender).trim();
      dbUser.gender = v.length ? v : "";
    }

    if (body.bio !== undefined) {
      const v = String(body.bio).trim();
      dbUser.bio = v.length ? v : "";
    }

    // location may be provided as JSON string (multipart)
    if (body.location !== undefined && body.location !== "") {
      let locationInput = body.location;
      let locationObj = null;
      try {
        locationObj =
          typeof locationInput === "string"
            ? JSON.parse(locationInput)
            : locationInput;
      } catch (e) {
        const err = new Error("Invalid location format");
        err.statusCode = 400;
        throw err;
      }

      // require address, lat, lng when location is provided
      if (
        !locationObj ||
        !locationObj.address ||
        locationObj.lat === undefined ||
        locationObj.lat === null ||
        locationObj.lng === undefined ||
        locationObj.lng === null
      ) {
        const err = new Error("Location must include address, lat and lng");
        err.statusCode = 400;
        throw err;
      }

      const latNum = Number(locationObj.lat);
      const lngNum = Number(locationObj.lng);
      if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
        const err = new Error("Location lat and lng must be numeric");
        err.statusCode = 400;
        throw err;
      }

      dbUser.location = {
        type: "Point",
        coordinates: [Number(lngNum), Number(latNum)],
        address: locationObj.address,
      };
    }

    // ---- Handle profile image (optional) ----
    let newProfileImageKey = null;
    if (file) {
      if (file.key && typeof file.key === "string" && file.key.length > 0) {
        // S3 style upload middleware might populate file.key
        newProfileImageKey = file.key;
      } else if (file.path) {
        const rel = path.relative(process.cwd(), file.path).replace(/\\/g, "/");
        newProfileImageKey = rel.startsWith("uploads/")
          ? rel
          : `uploads/${rel}`;
      } else if (file.filename && file.destination) {
        const rel = path
          .relative(process.cwd(), path.join(file.destination, file.filename))
          .replace(/\\/g, "/");
        newProfileImageKey = rel.startsWith("uploads/")
          ? rel
          : `uploads/${rel}`;
      } else {
        // fallback generation
        const ext = path.extname(file.originalname || "") || "";
        newProfileImageKey = `uploads/images/${Date.now()}-${Math.random()
          .toString(36)
          .substring(2)}${ext}`;
      }
    }

    // Delete previous image if replaced (non-fatal)
    const previousKey = dbUser.profileImageKey;
    if (
      newProfileImageKey &&
      previousKey &&
      previousKey !== newProfileImageKey
    ) {
      try {
        const looksLikeLocal = String(previousKey).startsWith("uploads/");
        if (!looksLikeLocal) {
          // delete from S3 via s3Utils if available
          if (
            s3Utils &&
            typeof s3Utils.isConfigured === "function" &&
            s3Utils.isConfigured()
          ) {
            if (typeof s3Utils.deleteFile === "function") {
              await s3Utils.deleteFile(previousKey).catch((e) => {
                console.error("s3Utils.deleteFile failed (non-fatal):", e);
              });
            }
          }
        } else {
          // delete local file
          try {
            const localPath = path.join(
              process.cwd(),
              previousKey.replace(/^\/+/, "")
            );
            if (fs.existsSync(localPath)) {
              fs.unlinkSync(localPath);
            }
          } catch (e) {
            console.error(
              "Failed to delete previous local file (non-fatal):",
              e
            );
          }
        }
      } catch (e) {
        console.error(
          "Error while attempting to remove previous profile image (non-fatal):",
          e
        );
      }
    }

    if (newProfileImageKey) {
      dbUser.profileImageKey = newProfileImageKey;
    }

    // do not force profileCompleted here (leave as-is)

    await dbUser.save();

    // ---- Build profileImageUrl (full URL) ----
    let profileImageUrl = null;
    if (dbUser.profileImageKey) {
      const key = String(dbUser.profileImageKey);
      const looksLikeFullUrl = /^(https?:)?\/\//i.test(key);
      const looksLikeLocal = key.startsWith("uploads/");

      if (looksLikeFullUrl) {
        profileImageUrl = key;
      } else if (
        !looksLikeLocal &&
        s3Utils &&
        typeof s3Utils.isConfigured === "function" &&
        s3Utils.isConfigured()
      ) {
        try {
          profileImageUrl =
            typeof s3Utils.getFileUrl === "function"
              ? s3Utils.getFileUrl(key)
              : null;
        } catch (e) {
          console.error("s3Utils.getFileUrl failed (non-fatal):", e);
          profileImageUrl = null;
        }
      } else {
        // local file -> absolute URL using APP_BASE_URL
        profileImageUrl = `${APP_BASE_URL}/${dbUser.profileImageKey}`.replace(
          /([^:]\/)\/+/g,
          "$1"
        );
      }
    }

    // ---- Build safe user object for response ----
    const userObj = dbUser.toObject
      ? dbUser.toObject()
      : JSON.parse(JSON.stringify(dbUser));
    if (userObj.password) delete userObj.password;
    if (userObj.lastAuthToken) delete userObj.lastAuthToken;
    if (userObj.__v !== undefined) delete userObj.__v;

    // Always include profileImageKey and profileImageUrl explicitly
    userObj.profileImageKey = dbUser.profileImageKey || null;
    userObj.profileImageUrl = profileImageUrl || null;

    // Do NOT include 'next' or stripe fields (stripe removed)

    return {
      message: "Profile updated successfully",
      data: {
        user: userObj,
      },
    };
  }
}

module.exports = new ProfileService();
