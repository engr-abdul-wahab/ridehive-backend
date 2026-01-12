// src/services/admin-service.js
const fs = require("fs");
const path = require("path");
const User = require("../../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { s3Utils } = require("../../config/aws-s3");

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || "10", 10);
const JWT_SECRET = process.env.JWT_SECRET || "replace-me";
const JWT_EXP = process.env.JWT_EXPIRES_IN || "7d";
const APP_BASE_URL = process.env.APP_BASE_URL || "";

class AdminService {
  constructor() {
    this.JWT_SECRET = process.env.JWT_SECRET;
    this.JWT_EXP = process.env.JWT_EXPIRES_IN || "7d";
    this.s3Utils = require("../../config/aws-s3").s3Utils;
    this.APP_BASE_URL = process.env.APP_BASE_URL || "";
  }

  /**
   * Helper to build profileImageUrl from a key
   */
  _buildProfileImageUrl(key) {
    if (!key) return null;
    const k = String(key).trim();
    if (/^(https?:)?\/\//i.test(k)) return k; // full url or protocol-relative

    const looksLikeLocal = k.startsWith("uploads/");
    if (
      !looksLikeLocal &&
      s3Utils &&
      typeof s3Utils.isConfigured === "function" &&
      s3Utils.isConfigured()
    ) {
      try {
        if (typeof s3Utils.getFileUrl === "function")
          return s3Utils.getFileUrl(k);
      } catch (e) {
        console.error("s3Utils.getFileUrl failed:", e);
        return k;
      }
    }

    // local file
    if (looksLikeLocal) {
      if (!APP_BASE_URL) return k;
      return `${APP_BASE_URL}/${k.replace(/^\/+/, "")}`;
    }

    // fallback
    return k;
  }

  /**
   * Login with email/password (admin only)
   * returns { token, admin }
   */
  async login({ email, password }) {
    if (!email || !password) {
      const e = new Error("Email and password required");
      e.statusCode = 400;
      throw e;
    }

    const admin = await User.findOne({
      email: email.toLowerCase(),
      role: "admin",
    }).exec();
    if (!admin) {
      const e = new Error("Admin not found");
      e.statusCode = 404;
      throw e;
    }

    if (!admin.password) {
      const e = new Error("Admin has no local password");
      e.statusCode = 400;
      throw e;
    }

    const ok = await bcrypt.compare(String(password), admin.password);
    if (!ok) {
      const e = new Error("Invalid credentials");
      e.statusCode = 401;
      throw e;
    }

    // create jti and token
    const jti = uuidv4();
    const payload = { sub: String(admin._id), role: "admin", jti };
    const token = jwt.sign(payload, this.JWT_SECRET, {
      expiresIn: this.JWT_EXP,
    });

    // persist lastAuthToken = jti
    admin.lastAuthToken = jti;
    await admin.save();

    // sanitize admin object for response
    const safeAdmin = {
      id: admin._id,
      email: admin.email,
      fullName: admin.fullName,
      role: admin.role,
      isActive: admin.isActive,
      gender: admin.gender || null,
      phone: admin.phone || null,
      bio: admin.bio || null,
      location: admin.location || null,
      profileImageUrl: this._buildProfileImageUrl(admin.profileImageKey),
    };

    return { token, admin: safeAdmin, expiresIn: this.JWT_EXP };
  }

  async logout(adminId) {
    const admin = await User.findById(adminId).exec();
    if (!admin) {
      const e = new Error("Admin not found");
      e.statusCode = 404;
      throw e;
    }

    admin.lastAuthToken = null;
    await admin.save();
    return;
  }

  /**
   * Return profile (with profileImageUrl)
   */
  async getProfile(adminId) {
    if (!adminId) {
      const e = new Error("adminId is required");
      e.statusCode = 400;
      throw e;
    }

    const admin = await User.findById(adminId)
      .select("-password -__v -lastAuthToken")
      .lean()
      .exec();
    if (!admin) {
      const e = new Error("Admin not found");
      e.statusCode = 404;
      throw e;
    }

    const profileImageUrl = this._buildProfileImageUrl(admin.profileImageKey);
    return { ...admin, profileImageUrl };
  }

  /**
   * Update profile
   * - updates = req.body
   * - file = optional multer file object for profile image
   *
   * Accepts either a provided profileImageKey in body OR an uploaded file object.
   */
  async updateProfile(adminId, updates = {}, file = null) {
    if (!adminId) {
      const e = new Error("adminId is required");
      e.statusCode = 400;
      throw e;
    }

    // Server-side forbids
    if (updates.email !== undefined) {
      const e = new Error(
        "You are not allowed to change email via this endpoint"
      );
      e.statusCode = 403;
      throw e;
    }
    if (updates.role !== undefined) {
      const e = new Error(
        "You are not allowed to change role via this endpoint"
      );
      e.statusCode = 403;
      throw e;
    }

    const dbUser = await User.findById(adminId).exec();
    if (!dbUser) {
      const e = new Error("Admin not found");
      e.statusCode = 404;
      throw e;
    }

    // handle profile image upload or provided key
    // file object shape handled according to your snippet
    let newProfileImageKey = null;
    if (file) {
      // file may contain key, path, filename+destination, or originalname
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
    } else if (
      updates.profileImageKey &&
      typeof updates.profileImageKey === "string" &&
      updates.profileImageKey.length > 0
    ) {
      newProfileImageKey = updates.profileImageKey;
    }

    // apply allowlist updates (other than profileImageKey which we handle separately)
    const allowed = ["fullName", "phone", "gender", "bio", "location"];
    let changed = false;

    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(updates, key)) {
        if (key === "location" && updates.location) {
          let loc;
          // parse JSON if coming from form-data
          try {
            loc =
              typeof updates.location === "string"
                ? JSON.parse(updates.location)
                : updates.location;
          } catch (e) {
            const err = new Error("Invalid JSON for location");
            err.statusCode = 400;
            throw err;
          }

          // enforce Point type and coordinates
          if (!loc.type || loc.type !== "Point") {
            const err = new Error('location.type must equal "Point"');
            err.statusCode = 400;
            throw err;
          }

          if (!Array.isArray(loc.coordinates) || loc.coordinates.length !== 2) {
            const err = new Error(
              "location.coordinates must be an array of two numbers [lng, lat]"
            );
            err.statusCode = 400;
            throw err;
          }

          dbUser.location = {
            type: "Point",
            coordinates: loc.coordinates.map(Number),
            address:
              loc.address || (dbUser.location && dbUser.location.address) || "",
          };
        } else {
          dbUser[key] = updates[key];
        }
        changed = true;
      }
    }

    // handle profile image replacement & deletion of previous
    const previousKey = dbUser.profileImageKey;
    if (newProfileImageKey && newProfileImageKey !== previousKey) {
      // delete previous (S3 or local) if exists
      try {
        const looksLikeLocal = String(previousKey || "").startsWith("uploads/");
        if (!looksLikeLocal) {
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
          // local file
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

      // set new key on user
      dbUser.profileImageKey = newProfileImageKey;
      changed = true;
    }

    // if nothing changed, return current safe object
    if (!changed) {
      const safe = await User.findById(adminId)
        .select("-password -__v -lastAuthToken")
        .lean()
        .exec();
      const profileImageUrl = this._buildProfileImageUrl(safe.profileImageKey);
      return { ...safe, profileImageUrl };
    }

    // save updates
    await dbUser.save();

    // return sanitized user with profileImageUrl
    const safe = await User.findById(adminId)
      .select("-password -__v -lastAuthToken")
      .lean()
      .exec();
    const profileImageUrl = this._buildProfileImageUrl(safe.profileImageKey);
    return { ...safe, profileImageUrl };
  }

  async changePassword(adminId, oldPassword, newPassword) {
    if (!adminId) {
      const e = new Error("adminId is required");
      e.statusCode = 400;
      throw e;
    }
    if (!oldPassword || !newPassword) {
      const e = new Error("Both oldPassword and newPassword are required");
      e.statusCode = 400;
      throw e;
    }

    const admin = await User.findById(adminId).exec();
    if (!admin) {
      const e = new Error("Admin not found");
      e.statusCode = 404;
      throw e;
    }

    const match = await bcrypt.compare(String(oldPassword), admin.password);
    if (!match) {
      const e = new Error("Old password is incorrect");
      e.statusCode = 401;
      throw e;
    }

    admin.password = await bcrypt.hash(String(newPassword), SALT_ROUNDS);
    await admin.save();

    // Optional: return updated admin safe object with profileImageUrl
    const safe = await User.findById(adminId)
      .select("-password -__v -lastAuthToken")
      .lean()
      .exec();

    safe.profileImageUrl = this._buildProfileImageUrl(safe.profileImageKey);
    return safe;
  }
}

module.exports = new AdminService();
