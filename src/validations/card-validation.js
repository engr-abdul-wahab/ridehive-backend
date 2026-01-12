// src/validations/card-validation.js
const { body } = require("express-validator");

const addCardValidation = [
  body("paymentMethodId")
    .trim()
    .notEmpty()
    .withMessage("paymentMethodId is required")
    .isString()
    .withMessage("paymentMethodId must be a string"),
  body("setDefault")
    .optional()
    .isBoolean()
    .withMessage("setDefault must be boolean"),
];

const activateCardValidation = [
  body("paymentMethodId")
    .trim()
    .notEmpty()
    .withMessage("paymentMethodId is required")
    .isString()
    .withMessage("paymentMethodId must be a string"),
];

const deleteCardValidation = [
  body("paymentMethodId")
    .trim()
    .notEmpty()
    .withMessage("paymentMethodId is required")
    .isString()
    .withMessage("paymentMethodId must be a string"),
];

module.exports = {
  addCardValidation,
  activateCardValidation,
  deleteCardValidation,
};
