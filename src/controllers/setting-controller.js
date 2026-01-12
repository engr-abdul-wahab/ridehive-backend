// controllers/setting-controller.js
const settingService = require("../service/setting-service");
const { handlers } = require("../utils/handlers");

class settingController {
  constructor() {
    this.updatePushNotification = this.updatePushNotification.bind(this);
    this.updateAccountStatus = this.updateAccountStatus.bind(this);
    this.getPrivacyPolicy = this.getPrivacyPolicy.bind(this);
    this.getTermsAndConditions = this.getTermsAndConditions.bind(this);
    this.getFaqs = this.getFaqs.bind(this);
    this.changePassword = this.changePassword.bind(this);
    this.deleteAccount = this.deleteAccount.bind(this);
  }

  // POST /settings/push-notification
  async updatePushNotification(req, res) {
    try {
      const userId = req.user.id; // Authenticated user
      const { pushNotification } = req.body;

      const updatedUser = await settingService.updatePushNotification(
        userId,
        pushNotification
      );

      if (!updatedUser) {
        handlers.logger.unavailable({
          object_type: "user",
          message: "User not found",
        });
        return handlers.response.unavailable({
          res,
          message: "User not found",
        });
      }

      handlers.logger.success({
        object_type: "push_notification",
        message: "Preference updated",
      });
      return handlers.response.success({
        res,
        message: "Push notification preference updated successfully",
        data: { pushNotification: updatedUser.pushNotification },
      });
    } catch (err) {
      handlers.logger.error({
        object_type: "push_notification",
        message: "Failed to update preference",
        data: err.message,
      });
      return handlers.response.error({
        res,
        message: "Failed to update push notification preference",
      });
    }
  }

  // POST /settings/account-status
  async updateAccountStatus(req, res) {
    try {
      const userId = req.user.id;
      const { isActive } = req.body;

      const updatedUser = await settingService.updateAccountStatus(
        userId,
        isActive
      );

      if (!updatedUser) {
        handlers.logger.unavailable({
          object_type: "user",
          message: "User not found",
        });
        return handlers.response.unavailable({
          res,
          message: "User not found",
        });
      }

      handlers.logger.success({
        object_type: "account_status",
        message: "Account status updated",
      });

      return handlers.response.success({
        res,
        message: "Account status updated successfully",
        data: { isActive: updatedUser.isActive },
      });
    } catch (err) {
      handlers.logger.error({
        object_type: "account_status",
        message: "Failed to update account status",
        data: err.message,
      });
      return handlers.response.error({
        res,
        message: "Failed to update account status",
      });
    }
  }

  // GET /settings/privacy-policy
  async getPrivacyPolicy(req, res) {
    try {
      const lang = req.query.lang || "en";
      const doc = await settingService.getActive("privacy_policy", lang);

      if (!doc) {
        handlers.logger.unavailable({
          object_type: "privacy_policy",
          message: "Privacy policy not found",
        });
        return handlers.response.unavailable({
          res,
          message: "Privacy policy not found",
        });
      }

      handlers.logger.success({
        object_type: "privacy_policy",
        message: "Privacy policy fetched",
      });
      return handlers.response.success({
        res,
        message: "Privacy policy fetched successfully",
        data: {
          id: doc._id,
          title: doc.title,
          content: doc.content,
          meta: doc.meta,
          updatedAt: doc.updatedAt,
        },
      });
    } catch (err) {
      handlers.logger.error({
        object_type: "privacy_policy",
        message: "Failed to fetch privacy policy",
        data: err.message,
      });
      return handlers.response.error({
        res,
        message: "Failed to fetch privacy policy",
      });
    }
  }

  // GET /settings/terms-and-conditions
  async getTermsAndConditions(req, res) {
    try {
      const lang = req.query.lang || "en";
      const doc = await settingService.getActive("terms_and_conditions", lang);

      if (!doc) {
        handlers.logger.unavailable({
          object_type: "terms_and_conditions",
          message: "Terms & conditions not found",
        });
        return handlers.response.unavailable({
          res,
          message: "Terms & conditions not found",
        });
      }

      handlers.logger.success({
        object_type: "terms_and_conditions",
        message: "T&C fetched",
      });
      return handlers.response.success({
        res,
        message: "Terms & conditions fetched successfully",
        data: {
          id: doc._id,
          title: doc.title,
          content: doc.content,
          meta: doc.meta,
          updatedAt: doc.updatedAt,
        },
      });
    } catch (err) {
      handlers.logger.error({
        object_type: "terms_and_conditions",
        message: "Failed to fetch T&C",
        data: err.message,
      });
      return handlers.response.error({
        res,
        message: "Failed to fetch terms and conditions",
      });
    }
  }

  /**
   * GET /settings/faqs
   * Query params:
   *  - status: active|inactive|all (default active)
   *  - page: 1
   *  - limit: 20
   */
  async getFaqs(req, res) {
    try {
      const status = (req.query.status || "active").toString();
      const page = req.query.page || 1;
      const limit = req.query.limit || 20;

      // validate status
      const allowed = ["active", "inactive", "all"];
      if (!allowed.includes(status)) {
        handlers.logger.failed({
          object_type: "faqs",
          message: "Invalid status query",
        });
        return handlers.response.failed({
          res,
          message: "Invalid status query. Use active|inactive|all",
        });
      }

      const result = await settingService.getFaqs({ status, page, limit });

      if (!result || !result.items || result.items.length === 0) {
        handlers.logger.nocontent({
          object_type: "faqs",
          message: "No FAQs found",
        });
        return handlers.response.nocontent({
          res,
          message: "No FAQs found",
          data: { items: [], meta: result ? result.meta : {} },
        });
      }

      handlers.logger.success({ object_type: "faqs", message: "FAQs fetched" });
      return handlers.response.success({
        res,
        message: "FAQs fetched successfully",
        data: result,
      });
    } catch (err) {
      handlers.logger.error({
        object_type: "faqs",
        message: "Failed to fetch FAQs",
        data: err.message,
      });
      return handlers.response.error({ res, message: "Failed to fetch FAQs" });
    }
  }

  /**
   * POST /settings/change-password
   * Body: { password, newPassword, confirmPassword }
   * Authenticated route - req.user must be present (from your auth middleware)
   */
  async changePassword(req, res) {
    try {
      // ensure authenticated user id is available
      const userId = req.user && (req.user.id || req.user._id);
      if (!userId) {
        handlers.logger.unauthorized({
          object_type: "change_password",
          message: "Unauthorized access",
        });
        return handlers.response.unauthorized({ res, message: "Unauthorized" });
      }

      const { password, newPassword } = req.body;

      // call business logic in service
      const result = await settingService.changePassword(
        userId,
        password,
        newPassword
      );

      handlers.logger.success({
        object_type: "change_password",
        message: result.message,
      });
      return handlers.response.success({ res, message: result.message });
    } catch (err) {
      // service throws errors with statusCode set for known failure cases
      const message = err.message || "Failed to change password";
      const statusCode = err.statusCode || 500;

      // log appropriately
      if (statusCode >= 500) {
        handlers.logger.error({
          object_type: "change_password",
          message,
          data: err.stack || err.message,
        });
        return handlers.response.error({ res, message });
      }

      // client errors
      handlers.logger.failed({ object_type: "change_password", message });
      return res.status(statusCode).send({ status: 0, message });
    }
  }
  /**
   * DELETE /settings/delete-account
   * Authenticated route - req.user must be present
   */
  async deleteAccount(req, res) {
    try {
      const userId = req.user && (req.user.id || req.user._id);
      if (!userId) {
        handlers.logger.unauthorized({
          object_type: "delete_account",
          message: "Unauthorized access",
        });
        return handlers.response.unauthorized({ res, message: "Unauthorized" });
      }

      const updated = await settingService.softDeleteAccount(userId);

      if (!updated) {
        handlers.logger.unavailable({
          object_type: "delete_account",
          message: "User not found",
        });
        return handlers.response.unavailable({
          res,
          message: "User not found",
        });
      }

      handlers.logger.success({
        object_type: "delete_account",
        message: "Account soft-deleted",
      });
      return handlers.response.success({
        res,
        message: "Account deleted successfully",
        data: { isDeleted: updated.isDeleted, deletedAt: updated.deletedAt },
      });
    } catch (err) {
      handlers.logger.error({
        object_type: "delete_account",
        message: "Failed to delete account",
        data: err.stack || err.message,
      });
      return handlers.response.error({
        res,
        message: "Failed to delete account",
      });
    }
  }
}

module.exports = new settingController();
