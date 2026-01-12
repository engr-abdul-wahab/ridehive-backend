const express = require("express");
const router = express.Router();
const ReviewController = require("../controllers/review-controller");
const validate = require("../middlewares/validate");
const auth = require("../middlewares/auth-middleware");
const roleMiddleware = require("../middlewares/role-middleware");
const upload = require("../middlewares/multer-middleware");
const {
  addReviewValidation,
  driverReviewValidation,
} = require("../validations/review-validation");

const reviewController = ReviewController;

router.post(
  "/add-review",
  auth,
  roleMiddleware("user"),
  upload.none(),
  addReviewValidation,
  validate,
  reviewController.addReview
);

router.get(
  "/get-driver-reviews",
  auth,
  roleMiddleware("user"),
  driverReviewValidation,
  validate,
  reviewController.getDriverReviews
);

module.exports = router;
