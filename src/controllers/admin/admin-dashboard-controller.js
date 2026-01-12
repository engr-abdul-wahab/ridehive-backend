// src/controllers/admin/admin-dashboard-controller.js
const catchAsync = require("../../utils/catchAsync");
const DashboardService = require("../../service/admin/admin-dashboard-service");
const { handlers } = require("../../utils/handlers");

class AdminDashboardController {
  // GET /admin/dashboard
  getDashboardStats = catchAsync(async (req, res) => {
    // service returns all-time data (no period)
    const stats = await DashboardService.getDashboardStats();

    handlers.logger.success({
      object_type: "admin.dashboard.overview",
      message: "Fetched dashboard stats",
      data: { adminId: req.user && req.user.id ? req.user.id : null },
    });

    return handlers.response.success({
      res,
      code: 200,
      message: "Dashboard stats fetched successfully",
      data: stats,
    });
  });

  // 📊 Daily rides graph
  getRidesGraph = catchAsync(async (req, res) => {
    const graph = await DashboardService.getRidesGraph();

    return handlers.response.success({
      res,
      code: 200,
      message: "Rides trend fetched successfully",
      data: graph,
    });
  });

  // 📊 Daily revenue graph
  getRevenueGraph = catchAsync(async (req, res) => {
    const graph = await DashboardService.getRevenueGraph();

    return handlers.response.success({
      res,
      code: 200,
      message: "Revenue trend fetched successfully",
      data: graph,
    });
  });

  // 📊 Daily new users graph
  getUsersGraph = catchAsync(async (req, res) => {
    const graph = await DashboardService.getUsersGraph();

    return handlers.response.success({
      res,
      code: 200,
      message: "Users trend fetched successfully",
      data: graph,
    });
  });
}

module.exports = new AdminDashboardController();
