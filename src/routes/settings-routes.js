// routes/setting-routes.js
const express = require("express");
const router = express.Router();
const settingController = require("../controllers/setting-controller");
const auth = require("../middlewares/auth-middleware");
const roleMiddleware = require("../middlewares/role-middleware");
const {
  updatePushNotificationValidation,
  updateAccountStatusValidation,
  changePasswordValidation,
} = require("../validations/setting-validation");
const validate = require("../middlewares/validate");
const upload = require("../middlewares/multer-middleware");

router.post(
  "/push-notification",
  upload.none(),
  auth,
  updatePushNotificationValidation,
  validate,
  settingController.updatePushNotification
);
router.post(
  "/account-status",
  upload.none(),
  auth,
  roleMiddleware(["user", "driver"]),
  updateAccountStatusValidation,
  validate,
  settingController.updateAccountStatus
);
router.get("/privacy-policy", settingController.getPrivacyPolicy);
router.get("/terms-and-conditions", settingController.getTermsAndConditions);
router.get(
  "/faqs",
  auth,
  roleMiddleware(["user", "driver"]),
  settingController.getFaqs
);
router.post(
  "/change-password",
  upload.none(),
  auth,
  roleMiddleware(["user", "driver"]),
  changePasswordValidation,
  validate,
  settingController.changePassword
);
router.delete(
  "/delete-account",
  auth,
  roleMiddleware(["user", "driver"]),
  settingController.deleteAccount
);

module.exports = router;
