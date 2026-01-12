const { query, param, body } = require("express-validator");

const getTermsValidation = [
  // no params; keep for consistency
];

const updateTermsValidation = [
  body("title")
    .optional()
    .isString()
    .withMessage("title must be a string")
    .isLength({ max: 200 })
    .withMessage("title max length is 200"),
  body("content").optional().isString().withMessage("content must be a string"),
  body("is_active")
    .optional()
    .isBoolean()
    .withMessage("is_active must be boolean")
    .toBoolean(),
  body("meta")
    .optional()
    .custom((value) => {
      if (typeof value === "string") {
        try {
          value = JSON.parse(value);
        } catch (e) {
          throw new Error("meta must be a valid JSON object");
        }
      }
      if (typeof value !== "object" || Array.isArray(value))
        throw new Error("meta must be an object");
      if (value.language && typeof value.language !== "string")
        throw new Error("meta.language must be a string");
      if (value.version && typeof value.version !== "string")
        throw new Error("meta.version must be a string");
      return true;
    }),
];

const getPrivacyValidation = [];

const updatePrivacyValidation = [
  body("title").optional().isString().withMessage("title must be a string"),
  body("content").optional().isString().withMessage("content must be a string"),
  body("is_active")
    .optional()
    .isBoolean()
    .withMessage("is_active must be a boolean")
    .toBoolean(),
  body("meta").optional().isObject().withMessage("meta must be an object"),
];

const listFaqsValidation = [
  query("page").optional().isInt({ min: 1 }).toInt(),
  query("limit").optional().isInt({ min: 1, max: 200 }).toInt(),
  query("search").optional().isString().trim(),
  query("status").optional().isIn(["active", "inactive", "all"]),
];

const getFaqValidation = [
  param("id").isMongoId().withMessage("Invalid faq id"),
];

const createFaqValidation = [
  body("question")
    .notEmpty()
    .withMessage("question is required")
    .isString()
    .withMessage("question must be a string")
    .isLength({ max: 500 })
    .withMessage("question max length is 500"),
  body("answer")
    .notEmpty()
    .withMessage("answer is required")
    .isString()
    .withMessage("answer must be a string")
    .isLength({ max: 2000 })
    .withMessage("answer max length is 2000"),
  body("status")
    .optional()
    .isIn(["active", "inactive"])
    .withMessage("status must be active|inactive"),
];

const updateFaqValidation = [
  param("id").isMongoId().withMessage("Invalid faq id"),
  body("question")
    .optional({ checkFalsy: true })
    .isString()
    .isLength({ max: 500 })
    .withMessage("question max length is 500"),
  body("answer")
    .optional({ checkFalsy: true })
    .isString()
    .isLength({ max: 2000 })
    .withMessage("answer max length is 2000"),
  body("status")
    .optional()
    .isIn(["active", "inactive"])
    .withMessage("status must be active|inactive"),
];

const deleteFaqValidation = [
  param("id").isMongoId().withMessage("Invalid faq id"),
];

module.exports = {
  getTermsValidation,
  updateTermsValidation,

  getPrivacyValidation,
  updatePrivacyValidation,

  listFaqsValidation,
  getFaqValidation,
  createFaqValidation,
  updateFaqValidation,
  deleteFaqValidation,
};
