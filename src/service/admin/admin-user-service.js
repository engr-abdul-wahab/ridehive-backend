// src/services/admin-user-service.js
const User = require("../../models/User");
const RideRequest = require("../../models/RideRequest");
const { isValidObjectId, Types } = require("mongoose");
const { buildProfileImageUrl } = require("../../utils/profile-image");
const path = require("path");
const fs = require("fs");
const { s3Utils } = require("../../config/aws-s3");

class AdminUserService {
  constructor() {}

  _buildProfileImageUrl(key) {
    if (!key) return null;
    const k = String(key).trim();
    if (/^(https?:)?\/\//i.test(k)) return k;

    const looksLikeLocal = k.startsWith("uploads/");
    if (
      !looksLikeLocal &&
      s3Utils &&
      s3Utils.isConfigured &&
      s3Utils.isConfigured()
    ) {
      try {
        return s3Utils.getFileUrl(k);
      } catch (e) {
        return k;
      }
    }

    if (looksLikeLocal) {
      return `${process.env.APP_BASE_URL || ""}/${k.replace(/^\/+/, "")}`;
    }

    return k;
  }

  /**
   * List users with pagination, search and status filter.
   * Returns { meta: { page, limit, total, pages }, items: [users...] }
   */
  async listUsers({ page = 1, limit = 25, search = "", status = "active" }) {
    const q = { role: "user", isDeleted: false };

    if (status && status !== "all") {
      if (status === "active") q.isActive = true;
      if (status === "inactive") q.isActive = false;
      if (status === "blocked") q.isBlocked = true;
    }

    if (search && String(search).trim().length) {
      const s = String(search).trim();
      q.$or = [
        { fullName: { $regex: s, $options: "i" } },
        { email: { $regex: s, $options: "i" } },
        { phone: { $regex: s, $options: "i" } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [total, items] = await Promise.all([
      User.countDocuments(q),
      User.find(q)
        .select("-password -__v -lastAuthToken")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
    ]);

    const pages = Math.max(1, Math.ceil(total / Number(limit) || 1));

    const itemsWithUrl = items.map((u) => ({
      ...u,
      profileImageUrl: buildProfileImageUrl(u.profileImageKey),
    }));

    return {
      meta: { page: Number(page), limit: Number(limit), total, pages },
      items: itemsWithUrl,
    };
  }

  /**
   * Get single user by id (verifies role is 'user')
   * Returns sanitized user object (no password) with profileImageUrl
   */
  async getUser(userId) {
    if (!isValidObjectId(userId)) {
      const e = new Error("Invalid user id");
      e.statusCode = 400;
      throw e;
    }

    const user = await User.findById(userId)
      .select("-password -__v -lastAuthToken")
      .lean();

    if (!user || user.role !== "user") {
      const e = new Error("User not found");
      e.statusCode = 404;
      throw e;
    }

    return {
      ...user,
      profileImageUrl: buildProfileImageUrl(user.profileImageKey),
    };
  }

  /**
   * Update user allowed fields: fullName, phone, bio, location
   * Will not allow email or role modifications.
   * Returns the sanitized updated user (via getUser).
   */
  async updateUser(userId, updates = {}, file = null) {
    if (!isValidObjectId(userId)) {
      const e = new Error("Invalid user id");
      e.statusCode = 400;
      throw e;
    }

    // Prevent email or role update
    if (
      updates.email !== undefined ||
      updates.role !== undefined ||
      updates.password !== undefined
    ) {
      const e = new Error(
        "You are not allowed to change email, role, or password via this endpoint"
      );
      e.statusCode = 403;
      throw e;
    }

    const dbUser = await User.findById(userId).exec();
    if (!dbUser || dbUser.role !== "user") {
      const e = new Error("User not found");
      e.statusCode = 404;
      throw e;
    }

    let changed = false;

    // Allowed fields
    const allowed = ["fullName", "phone", "bio", "gender"];
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(updates, key)) {
        dbUser[key] = updates[key];
        changed = true;
      }
    }

    // Handle location separately
    if (updates.location) {
      let loc = updates.location;
      if (typeof loc === "string") {
        try {
          loc = JSON.parse(loc);
        } catch (e) {
          const err = new Error("Invalid JSON for location");
          err.statusCode = 400;
          throw err;
        }
      }

      if (!loc.type || loc.type !== "Point")
        throw new Error('location.type must equal "Point"');
      if (!Array.isArray(loc.coordinates) || loc.coordinates.length !== 2)
        throw new Error(
          "location.coordinates must be an array of two numbers [lng, lat]"
        );
      if (loc.address && typeof loc.address !== "string")
        throw new Error("location.address must be a string");

      dbUser.location = {
        type: "Point",
        coordinates: loc.coordinates.map(Number),
        address: loc.address || "",
      };
      changed = true;
    }

    // Handle profile image
    if (file) {
      let newKey = null;
      if (file.key) newKey = file.key;
      else if (file.path)
        newKey = path.relative(process.cwd(), file.path).replace(/\\/g, "/");

      // Delete previous profile image if exists
      const prevKey = dbUser.profileImageKey;
      if (prevKey && prevKey !== newKey) {
        const looksLocal = prevKey.startsWith("uploads/");
        if (!looksLocal && s3Utils && s3Utils.deleteFile) {
          s3Utils.deleteFile(prevKey).catch(() => {});
        } else if (looksLocal) {
          try {
            const localPath = path.join(
              process.cwd(),
              prevKey.replace(/^\/+/, "")
            );
            if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
          } catch (err) {}
        }
      }

      dbUser.profileImageKey = newKey;
      changed = true;
    }

    if (!changed) return this.getUser(userId);

    await dbUser.save();
    return this.getUser(userId);
  }

  async getUser(userId) {
    const user = await User.findById(userId)
      .select("-password -__v -lastAuthToken")
      .lean()
      .exec();
    if (!user) return null;
    user.profileImageUrl = this._buildProfileImageUrl(user.profileImageKey);
    return user;
  }

  /**
   * Block / unblock / suspend user.
   * action: "block" | "unblock" | "suspend"
   * reason: optional string
   * adminId: id of admin performing action (optional)
   */
  async blockUser(userId, action, reason = "", adminId = null) {
    if (!isValidObjectId(userId)) {
      const e = new Error("Invalid user id");
      e.statusCode = 400;
      throw e;
    }

    const user = await User.findById(userId).exec();
    if (!user || user.role !== "user") {
      const e = new Error("User not found");
      e.statusCode = 404;
      throw e;
    }

    if (action === "block") {
      user.isBlocked = true;
      user.isActive = false;
      user.tokenInvalidBefore = new Date();
    } else if (action === "unblock") {
      user.isBlocked = false;
      user.isActive = true;
    } else if (action === "suspend") {
      user.isBlocked = true;
      user.isActive = false;
      // Optionally you can accept a suspendUntil date in updates/reason or payload
      user.tokenInvalidBefore = new Date();
    } else {
      const e = new Error("Invalid action");
      e.statusCode = 400;
      throw e;
    }

    // Optional: store moderation log - not implemented here
    await user.save();
    return;
  }

  /**
   * Return paginated ride history for a user.
   * If Ride model doesn't exist, returns empty list structure.
   */
  async getUserRides(userId, { page = 1, limit = 25 } = {}) {
    if (!isValidObjectId(userId)) {
      const e = new Error("Invalid user id");
      e.statusCode = 400;
      throw e;
    }

    const skip = (Number(page) - 1) * Number(limit);

    const q = { userId: new Types.ObjectId(userId) }; // use userId as per schema

    const [total, items] = await Promise.all([
      RideRequest.countDocuments(q),
      RideRequest.find(q)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
    ]);

    const pages = Math.max(1, Math.ceil(total / Number(limit) || 1));

    return {
      meta: { page: Number(page), limit: Number(limit), total, pages },
      items,
    };
  }
}

module.exports = new AdminUserService();
