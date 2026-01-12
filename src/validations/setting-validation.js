// validators/setting-validator.js
const { body } = require("express-validator");

const updatePushNotificationValidation = [
  body('pushNotification')
    .exists().withMessage('pushNotification field is required.')
    .isBoolean().withMessage('pushNotification must be a boolean value (true/false).'),
];

const updateAccountStatusValidation = [
  body("isActive")
    .exists().withMessage("isActive field is required.")
    .isBoolean().withMessage("isActive must be a boolean value (true/false)."),
];

/**
 * Password rules:
 * - min 8 chars
 * - max 128 chars
 * - at least one uppercase, one lowercase, one digit
 */
const passwordRules = body("newPassword")
  .isLength({ min: 8, max: 128 })
  .withMessage("New password must be between 8 and 128 characters.")
  .matches(/(?=.*[a-z])/)
  .withMessage("New password must contain at least one lowercase letter.")
  .matches(/(?=.*[A-Z])/)
  .withMessage("New password must contain at least one uppercase letter.")
  .matches(/(?=.*\d)/)
  .withMessage("New password must contain at least one digit.");

const changePasswordValidation = [
  body("password")
    .exists({ checkFalsy: true })
    .withMessage("Current password is required."),
  passwordRules,
  body("confirmPassword")
    .exists({ checkFalsy: true })
    .withMessage("Confirm password is required.")
    .custom((value, { req }) => value === req.body.newPassword)
    .withMessage("Confirm password must match new password."),
  // NOTE: no final middleware here — central validate middleware will handle errors
];

module.exports = {
  updatePushNotificationValidation,
  updateAccountStatusValidation,
  changePasswordValidation,
};
