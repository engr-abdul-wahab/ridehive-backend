// src/service/admin/admin-dashboard-service.js
const User = require("../../models/User");
const Vehicle = require("../../models/Vehicle");
const RideRequest = require("../../models/RideRequest");
const Payment = require("../../models/Payment");

class AdminDashboardService {
  /**
   * Returns all-time aggregated dashboard stats.
   * Does not accept period filters (all-time).
   */
  async getDashboardStats() {
    // run counts / aggregations in parallel
    const [
      totalUsers,
      totalDrivers,
      approvedDrivers,
      pendingDriverApprovals,
      totalVehicles,
      totalRides,
      pendingRides,
      ongoingRides,
      completedRides,
      revenueAggResult,
    ] = await Promise.all([
      // all non-deleted normal users
      User.countDocuments({ role: "user", isDeleted: false }),

      // all drivers (not deleted)
      User.countDocuments({ role: "driver", isDeleted: false }),

      // drivers approved by admin
      User.countDocuments({
        role: "driver",
        isDeleted: false,
        isAdminApproved: true,
      }),

      // drivers pending admin approval
      User.countDocuments({
        role: "driver",
        isDeleted: false,
        isAdminApproved: false,
      }),

      // total vehicles
      Vehicle.countDocuments({}),

      // total rides (all statuses)
      RideRequest.countDocuments({}),

      // pending rides
      RideRequest.countDocuments({ status: "pending" }),

      // ongoing rides
      RideRequest.countDocuments({ status: "ongoing" }),

      // completed rides
      RideRequest.countDocuments({ status: "completed" }),

      // revenue: sum of completed payments.amountUSD
      Payment.aggregate([
        { $match: { status: "completed" } },
        { $group: { _id: null, total: { $sum: "$amountUSD" } } },
      ]),
    ]);

    const totalRevenueUSD =
      revenueAggResult && revenueAggResult.length > 0
        ? Number(revenueAggResult[0].total || 0)
        : 0;

    // Build response shape (no meta, no newThisPeriod)
    return {
      totals: {
        totalUsers: Number(totalUsers) || 0,
        totalDrivers: Number(totalDrivers) || 0,
        approvedDrivers: Number(approvedDrivers) || 0,
        pendingDriverApprovals: Number(pendingDriverApprovals) || 0,
        totalVehicles: Number(totalVehicles) || 0,
        totalRides: Number(totalRides) || 0,
        pendingRides: Number(pendingRides) || 0,
        ongoingRides: Number(ongoingRides) || 0,
        completedRides: Number(completedRides) || 0,
        totalRevenueUSD,
      },
    };
  }

  // 📊 Daily rides created
  async getRidesGraph() {
    const result = await RideRequest.aggregate([
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    ]);

    return result.map((r) => ({
      date: `${r._id.year}-${r._id.month}-${r._id.day}`,
      rides: r.count,
    }));
  }

  // 📊 Daily revenue from completed payments
  async getRevenueGraph() {
    const result = await Payment.aggregate([
      { $match: { status: "completed" } },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          totalRevenue: { $sum: "$amountUSD" },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    ]);

    return result.map((r) => ({
      date: `${r._id.year}-${r._id.month}-${r._id.day}`,
      revenueUSD: Number(r.totalRevenue),
    }));
  }

  // 📊 Daily new user signups
  async getUsersGraph() {
    const result = await User.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          newUsers: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    ]);

    return result.map((r) => ({
      date: `${r._id.year}-${r._id.month}-${r._id.day}`,
      newUsers: r.newUsers,
    }));
  }
}

module.exports = new AdminDashboardService();
