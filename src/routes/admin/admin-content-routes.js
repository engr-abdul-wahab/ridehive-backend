const express = require("express");
const router = express.Router();

const AdminContentController = require("../../controllers/admin/admin-content-controller");
const authMiddleware = require("../../middlewares/auth-middleware");
const adminMiddleware = require("../../middlewares/admin-middleware");
const validate = require("../../middlewares/validate");
const upload = require("../../middlewares/multer-middleware");

const {
  getTermsValidation,
  updateTermsValidation,
  getPrivacyValidation,
  updatePrivacyValidation,
  listFaqsValidation,
  getFaqValidation,
  createFaqValidation,
  updateFaqValidation,
  deleteFaqValidation,
} = require("../../validations/admin/admin-content-validation");

// Protect all admin content routes
router.use(authMiddleware, adminMiddleware);

/**
 * Terms & Conditions
 */
router.get(
  "/terms-conditions",
  getTermsValidation,
  validate,
  AdminContentController.getTerms
);

router.patch(
  "/terms-conditions",
  upload.none(),
  updateTermsValidation,
  validate,
  AdminContentController.updateTerms
);

/**
 * Privacy Policy
 */
router.get(
  "/privacy-policy",
  getPrivacyValidation,
  validate,
  AdminContentController.getPrivacy
);
router.patch(
  "/privacy-policy",
  upload.none(),
  updatePrivacyValidation,
  validate,
  AdminContentController.updatePrivacy
);

/**
 * FAQ management
 */
router.get(
  "/faqs",
  listFaqsValidation,
  validate,
  AdminContentController.listFaqs
);
router.post(
  "/faqs",
  upload.none(),
  createFaqValidation,
  validate,
  AdminContentController.createFaq
);
router.get(
  "/faqs/:id",
  getFaqValidation,
  validate,
  AdminContentController.getFaq
);
router.patch(
  "/faqs/:id",
  upload.none(),
  updateFaqValidation,
  validate,
  AdminContentController.updateFaq
);
router.delete(
  "/faqs/:id",
  deleteFaqValidation,
  validate,
  AdminContentController.deleteFaq
);

module.exports = router;
