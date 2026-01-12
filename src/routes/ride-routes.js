// src/routes/ride-routes.js
const router = require("express").Router();
const RideController = require("../controllers/ride-controller");
const auth = require("../middlewares/auth-middleware");
const roleMiddleware = require("../middlewares/role-middleware");
const {
  createInstantRideValidation,
} = require("../validations/instant-ride-validation");
const validate = require("../middlewares/validate");
const parseFormData = require("../middlewares/parse-formdata");

const rideController = new RideController();

router.post(
  "/instant-ride",
  auth,
  roleMiddleware("user"),
  parseFormData,
  createInstantRideValidation,
  validate,
  rideController.createInstantRide
);

// For ongoing rides
router.get(
  "/ongoing-rides",
  auth,
  roleMiddleware(["user", "driver"]),
  validate,
  rideController.getOngoingRides
);

// For user schedule rides
router.get(
  "/user-schedule-rides",
  auth,
  roleMiddleware("user"),
  rideController.getUserScheduleRides
);

// For driver schedule rides
router.get(
  "/driver-schedule-bookings",
  auth,
  roleMiddleware("driver"),
  rideController.getDriverScheduleRides
);

router.get(
  "/user-food-delivery-history",
  auth,
  roleMiddleware("user"),
  rideController.getFoodDeliveryHistoryForUser
);

router.get(
  "/user-ride-history",
  auth,
  roleMiddleware("user"),
  rideController.getUserRideHistory
);

router.get(
  "/driver-ride-history",
  auth,
  roleMiddleware("driver"),
  rideController.getDriverRideHistory
);

router.get(
  "/recent-places",
  auth,
  roleMiddleware("user"),
  rideController.getRecentPlaces
);

module.exports = router;
