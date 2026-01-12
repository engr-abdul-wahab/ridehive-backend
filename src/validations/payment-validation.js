const { body } = require("express-validator");

exports.createPaymentValidation = [
  body("rideId").notEmpty().withMessage("rideId is required"),
  body("amountUSD")
    .notEmpty()
    .withMessage("amountUSD is required")
    .isFloat({ gt: 0 })
    .withMessage("amountUSD must be greater than 0"),
  body("paymentMethodId").notEmpty().withMessage("paymentMethodId is required"),
];
