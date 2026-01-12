// services/setting-service.js
const content = require("../models/Content");
const Faq = require("../models/Faq");
const User = require("../models/User");
const bcrypt = require("bcryptjs");

class settingService {
  static async updatePushNotification(userId, value) {
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { pushNotification: value },
      { new: true }
    ).lean();

    return updatedUser;
  }

  static async updateAccountStatus(userId, value) {
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { isActive: value },
      { new: true }
    ).lean();

    return updatedUser;
  }

  /**
   * Fetch active content by type and optional language.
   * Returns plain object or null.
   * @param {String} type - 'privacy_policy'|'terms_and_conditions'
   * @param {String} [language='en']
   */
  static async getActive(type, language = "en") {
    if (!type) return null;
    const query = { type, is_active: true, "meta.language": language };
    const doc = await content
      .findOne(query)
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
    return doc || null;
  }

  /**
   * Get FAQs with optional status and pagination.
   * @param {Object} opts - { status = 'active'|'inactive'|'all', page = 1, limit = 20 }
   * @returns {Object} { items: [...], meta: { total, page, limit, pages } }
   */
  static async getFaqs(opts = {}) {
    const status = opts.status || "active";
    const page = Math.max(parseInt(opts.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const query = {};
    if (status && status !== "all") {
      query.status = status;
    }

    // get total count & items in parallel
    const [total, items] = await Promise.all([
      Faq.countDocuments(query).exec(),
      Faq.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
    ]);

    const pages = Math.ceil(total / limit) || 1;

    return {
      items,
      meta: {
        total,
        page,
        limit,
        pages,
      },
    };
  }

  /**
   * Change password business logic
   * @param {String} userId - authenticated user's id
   * @param {String} currentPassword - current password provided by user
   * @param {String} newPassword - desired new password
   * @returns {Object} { success: true, message } or throws Error
   */
  static async changePassword(userId, currentPassword, newPassword) {
    if (!userId) {
      const err = new Error("Unauthorized");
      err.statusCode = 401;
      throw err;
    }

    // fetch user
    const user = await User.findById(userId).select("+password").exec(); // ensure password field is selectable
    if (!user) {
      const err = new Error("User not found");
      err.statusCode = 404;
      throw err;
    }

    // Ensure password field exists on model (some setups exclude it by default)
    if (!user.password) {
      const err = new Error("Password is not set for this user");
      err.statusCode = 400;
      throw err;
    }

    // verify current password
    const isMatch = await bcrypt.compare(
      String(currentPassword),
      user.password
    );
    if (!isMatch) {
      const err = new Error("Current password is incorrect");
      err.statusCode = 400;
      throw err;
    }

    // optional: prevent reusing same password
    const isSame = await bcrypt.compare(String(newPassword), user.password);
    if (isSame) {
      const err = new Error(
        "New password must be different from the current password"
      );
      err.statusCode = 400;
      throw err;
    }

    // hash new password
    const saltRounds = process.env.BCRYPT_SALT_ROUNDS
      ? parseInt(process.env.BCRYPT_SALT_ROUNDS, 10)
      : 12;
    const hashed = await bcrypt.hash(String(newPassword), saltRounds);

    // update and save
    user.password = hashed;
    // optionally update a passwordChangedAt timestamp
    if (user.schema.path("passwordChangedAt")) {
      user.passwordChangedAt = new Date();
    }
    await user.save();

    return { success: true, message: "Password changed successfully" };
  }

  /**
   * Soft delete user account, invalidate tokens.
   * @param {String} userId
   * @returns {Object|null} updated user doc (lean) or null if not found
   */
  static async softDeleteAccount(userId) {
    if (!userId) return null;

    const now = new Date();
    const update = {
      isDeleted: true,
      isActive: false,
      pushNotification: false,
      deletedAt: now,
      // invalidate tokens issued before `now`
      tokenInvalidBefore: now,
      // clear last stored auth token (if you use it)
      lastAuthToken: null,
    };

    const opts = { new: true, runValidators: true };
    // return the updated document
    const updated = await User.findByIdAndUpdate(userId, update, opts)
      .lean()
      .exec();
    return updated || null;
  }
}

module.exports = settingService;
