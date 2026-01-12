const express = require("express");
const router = express.Router();
const PaymentController = require("../controllers/payment-controller");
const auth = require("../middlewares/auth-middleware");
const roleMiddleware = require("../middlewares/role-middleware");
const upload = require("../middlewares/multer-middleware");
const validate = require("../middlewares/validate");
const {
  createPaymentValidation,
} = require("../validations/payment-validation");

// POST /payments
router.post(
  "/paynow",
  auth,
  roleMiddleware("user"),
  upload.none(),
  createPaymentValidation,
  validate,
  PaymentController.createPayment
);

// GET /payments/:paymentId
router.get("/:paymentId", auth, PaymentController.getPayment);

module.exports = router;
