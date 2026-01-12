const catchAsync = require("../utils/catchAsync");
const { handlers } = require("../utils/handlers");
const ReviewService = require("../service/review-service");

class ReviewController {
  constructor() {
    this.addReview = this.addReview.bind(this);
    this.getDriverReviews = this.getDriverReviews.bind(this);
  }

  addReview = catchAsync(async (req, res) => {
    const userId = req.user && req.user.id;
    const { driverId, rideId, paymentId, rating, review, isAnonymous, meta } =
      req.body;

    const doc = await ReviewService.addReview({
      userId,
      driverId,
      rideId,
      paymentId,
      rating,
      review,
      isAnonymous,
      meta,
    });

    handlers.logger.success({
      object_type: "review.add",
      message: "Review added",
      data: { userId, driverId, rideId, reviewId: doc._id },
    });

    return handlers.response.success({
      res,
      code: 201,
      message: "Review submitted successfully",
      data: doc,
    });
  });

  getDriverReviews = catchAsync(async (req, res) => {
    const driverId = req.params.driverId || req.query.driverId;
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;

    const result = await ReviewService.getDriverReviews({
      driverId,
      page,
      limit,
    });

    return handlers.response.success({
      res,
      code: 200,
      message: "Driver reviews fetched",
      data: result,
    });
  });
}

module.exports = new ReviewController();
