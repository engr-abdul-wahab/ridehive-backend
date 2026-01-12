// src/routes/admin-routes.js
const express = require("express");
const router = express.Router();

const adminController = require("../../controllers/admin/admin-controller");
const authMiddleware = require("../../middlewares/auth-middleware");
const adminMiddleware = require("../../middlewares/admin-middleware");
const upload = require("../../middlewares/multer-middleware");
const validate = require("../../middlewares/validate");

const {
  loginValidation,
  changePasswordValidation,
  updateProfileValidation,
} = require("../../validations/admin/admin-validation");

// Public auth
router.post(
  "/login",
  upload.none(),
  loginValidation,
  validate,
  adminController.login
);

// Protected (admin only)
router.post("/logout", authMiddleware, adminMiddleware, adminController.logout);

router.get(
  "/get-profile",
  authMiddleware,
  adminMiddleware,
  adminController.getProfile
);

router.patch(
  "/update-profile",
  authMiddleware,
  adminMiddleware,
  upload.single("profileImage"),
  updateProfileValidation,
  validate,
  adminController.updateProfile
);

router.patch(
  "/change-password",
  upload.none(),
  authMiddleware,
  adminMiddleware,
  changePasswordValidation,
  validate,
  adminController.changePassword
);

module.exports = router;
