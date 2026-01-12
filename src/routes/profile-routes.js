// src/routes/profile.routes.js
const express = require("express");
const router = express.Router();
const profileController = require("../controllers/profile-controller");
const validate = require("../middlewares/validate");
const {
  createProfileValidation,
} = require("../validations/profile-validation");
const upload = require("../middlewares/multer-middleware");
const auth = require("../middlewares/auth-middleware");
const roleMiddleware = require("../middlewares/role-middleware");

router.post(
  "/create-profile",
  auth,
  roleMiddleware(["user", "driver"]),
  upload.single("profileImage"),
  createProfileValidation,
  validate,
  profileController.createProfile
);

router.patch(
  "/update-profile",
  auth,
  roleMiddleware(["user", "driver"]),
  upload.single("profileImage"),
  profileController.updateProfile
);

module.exports = router;
