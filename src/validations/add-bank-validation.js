// src/validations/add-bank-validation.js
const { body } = require("express-validator");

exports.addBankValidation = [
  body("bankName").notEmpty().withMessage("Bank name is required"),
  body("accountHolderName")
    .notEmpty()
    .withMessage("Account holder name is required"),
  body("accountNumber").notEmpty().withMessage("Account number is required"),
  body("routingNumber").notEmpty().withMessage("Routing number is required"),
];
