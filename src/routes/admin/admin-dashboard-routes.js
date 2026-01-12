const express = require("express");
const router = express.Router();

const AdminDashboardController = require("../../controllers/admin/admin-dashboard-controller");
const authMiddleware = require("../../middlewares/auth-middleware");
const adminMiddleware = require("../../middlewares/admin-middleware");
const validate = require("../../middlewares/validate");

// Protect all admin dashboard routes
router.use(authMiddleware, adminMiddleware);

// GET /admin/dashboard
router.get("/", validate, AdminDashboardController.getDashboardStats);

// 📊 Graph APIs
router.get("/graphs/rides", AdminDashboardController.getRidesGraph); // daily rides
router.get("/graphs/revenue", AdminDashboardController.getRevenueGraph); // daily revenue
router.get("/graphs/users", AdminDashboardController.getUsersGraph); // daily new users

module.exports = router;
