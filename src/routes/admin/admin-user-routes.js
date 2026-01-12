const express = require("express");
const router = express.Router();

const AdminUserController = require("../../controllers/admin/admin-user-controller");
const authMiddleware = require("../../middlewares/auth-middleware");
const adminMiddleware = require("../../middlewares/admin-middleware");
const validate = require("../../middlewares/validate");
const upload = require("../../middlewares/multer-middleware");

const {
  listUsersValidation,
  getUserValidation,
  updateUserValidation,
  blockUserValidation,
  userRidesValidation,
} = require("../../validations//admin/admin-user-validation");

// Protect all admin user routes
router.use(authMiddleware, adminMiddleware);

router.get("/", listUsersValidation, validate, AdminUserController.listUsers);
router.get("/:id", getUserValidation, validate, AdminUserController.getUser);

router.patch(
  "/:id",
  upload.single("profileImage"),
  updateUserValidation,
  validate,
  AdminUserController.updateUser
);

router.post(
  "/:id/block",
  upload.none(),
  blockUserValidation,
  validate,
  AdminUserController.blockUser
);

router.get(
  "/:id/rides",
  userRidesValidation,
  validate,
  AdminUserController.getUserRides
);

module.exports = router;
