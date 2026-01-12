const Review = require("../models/Review");
const Payment = require("../models/Payment");
const User = require("../models/User");
const mongoose = require("mongoose");
const ObjectId = mongoose.Types.ObjectId;
const { s3Utils } = require("../config/aws-s3");

class ReviewService {
  constructor() {
    this.APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:4000";
  }
  // helper to check if key is local
  isLocalKey(key) {
    if (!key || typeof key !== "string") return false;
    return key.startsWith("uploads/");
  }
  // build full url for profile image
  buildProfileImage(key) {
    if (!key) return null;
    const k = String(key).trim();
    // already a full URL
    if (/^(https?:)?\/\//i.test(k)) {
      return k;
    }

    // local file
    if (this.isLocalKey(k)) {
      if (!this.APP_BASE_URL) {
        console.log("APP_BASE_URL not set");
        return k; // fallback to raw key
      }

      return `${this.APP_BASE_URL.replace(/\/$/, "")}/${k.replace(/^\/+/, "")}`;
    }

    // S3 file
    if (s3Utils && typeof s3Utils.getFileUrl === "function") {
      try {
        const url = s3Utils.getFileUrl(k);
        return url || k; // fallback to raw key if S3 util fails
      } catch (e) {
        console.error("s3Utils.getFileUrl failed", e);
        return k; // fallback to raw key
      }
    }
    // fallback: return raw key
    return k;
  }

  /**
   * Add a review. Business rules:
   * - userId (author) must have completed payment for ride (payment.status === 'completed')
   * - one review per ride
   */
  async addReview({
    userId,
    driverId,
    rideId,
    paymentId = null,
    rating,
    review = null,
    isAnonymous = false,
    meta = {},
  }) {
    if (!userId) throw { statusCode: 400, message: "userId is required" };
    if (!driverId) throw { statusCode: 400, message: "driverId is required" };
    if (!rideId) throw { statusCode: 400, message: "rideId is required" };
    if (!rating || rating < 1 || rating > 5)
      throw { statusCode: 400, message: "rating must be between 1 and 5" };

    // Ensure rideId is valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(rideId))
      throw { statusCode: 400, message: "Invalid rideId" };

    // 1) Check payment exists and is completed
    const payment = await Payment.findOne({ rideId, userId });
    if (!payment || payment.status !== "completed") {
      throw {
        statusCode: 400,
        message: "Payment not found or not completed for this ride",
      };
    }

    // 2) Prevent duplicate review for same ride
    const existing = await Review.findOne({ rideId });
    if (existing)
      throw {
        statusCode: 409,
        message: "Review for this ride already submitted",
      };

    // Optionally check driver exists and has role driver
    const driver = await User.findById(driverId).select("role");
    if (!driver) throw { statusCode: 404, message: "Driver not found" };
    // if you want enforce role:
    // if (driver.role !== "driver") throw { statusCode: 400, message: "Target user is not a driver" };

    // 3) Create review
    const doc = await Review.create({
      userId,
      driverId,
      rideId,
      paymentId: paymentId || payment.paymentId || null,
      rating,
      review,
      isAnonymous,
      meta,
    });

    return doc.toObject();
  }

  /**
   * Get paginated reviews for a driver + aggregated stats (avg, count)
   */
  async getDriverReviews({ driverId, page = 1, limit = 10 }) {
    const skip = (page - 1) * limit;

    // Convert driverId string to ObjectId
    const driverObjectId = new ObjectId(driverId);

    // Get total count and average rating using aggregation
    const aggResult = await Review.aggregate([
      { $match: { driverId: driverObjectId } },
      {
        $group: {
          _id: "$driverId",
          totalReviews: { $sum: 1 },
          averageRating: { $avg: "$rating" },
        },
      },
    ]);
    const total = aggResult[0]?.totalReviews || 0;
    const averageRating = aggResult[0]?.averageRating || 0;

    // Find reviews for the driver and populate user info
    const reviews = await Review.find({ driverId: driverObjectId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: "userId",
        select: "fullName profileImageKey",
      })
      .lean();

    // Map the populated data
    const formatted = reviews.map((r) => ({
      _id: r._id,
      rideId: r.rideId,
      rating: r.rating,
      review: r.review,
      meta: r.meta,
      isAnonymous: r.isAnonymous,
      createdAt: r.createdAt,
      reviewer: r.userId
        ? {
            _id: r.userId._id,
            name: r.isAnonymous ? "Anonymous" : r.userId.fullName,
            profileImage: this.buildProfileImage(r.userId.profileImageKey),
          }
        : null,
    }));

    return {
      total,
      averageRating: Number(averageRating.toFixed(2)),
      page,
      limit,
      reviews: formatted,
    };
  }
}

module.exports = new ReviewService();
