const ContentService = require("../../service/admin/admin-content-service");
const catchAsync = require("../../utils/catchAsync");
const { handlers } = require("../../utils/handlers");

class AdminContentController {
  constructor() {
    this.getTerms = this.getTerms.bind(this);
    this.updateTerms = this.updateTerms.bind(this);

    this.getPrivacy = this.getPrivacy.bind(this);
    this.updatePrivacy = this.updatePrivacy.bind(this);

    this.listFaqs = this.listFaqs.bind(this);
    this.createFaq = this.createFaq.bind(this);
    this.getFaq = this.getFaq.bind(this);
    this.updateFaq = this.updateFaq.bind(this);
    this.deleteFaq = this.deleteFaq.bind(this);
  }

  // GET /admin/content/terms
  getTerms = catchAsync(async (req, res) => {
    const terms = await ContentService.getTerms();
    handlers.logger.success({
      object_type: "admin.content.terms.get",
      message: "Fetched terms & conditions",
      data: { adminId: req.user.id },
    });
    return handlers.response.success({
      res,
      code: 200,
      message: "Terms & conditions fetched",
      data: terms,
    });
  });

  // PATCH /admin/content/terms
  updateTerms = catchAsync(async (req, res) => {
    const updates = req.body || {};
    const updated = await ContentService.updateTerms(updates, req.user.id);
    handlers.logger.success({
      object_type: "admin.content.terms.update",
      message: "Updated terms & conditions",
      data: { adminId: req.user.id },
    });
    return handlers.response.success({
      res,
      code: 200,
      message: "Terms & conditions updated",
      data: updated,
    });
  });

  // Get Privacy Policy
  getPrivacy = catchAsync(async (req, res) => {
    const privacy = await ContentService.getContentByType("privacy_policy");

    handlers.logger.success({
      object_type: "admin.privacy.get",
      message: "Fetched privacy policy",
      data: { adminId: req.user.id },
    });

    return handlers.response.success({
      res,
      code: 200,
      message: "Privacy policy fetched",
      data: privacy,
    });
  });

  // Update Privacy Policy
  updatePrivacy = catchAsync(async (req, res) => {
    const updates = req.body;
    const updated = await ContentService.updatePrivacy(
      updates,
      req.user.id
    );

    handlers.logger.success({
      object_type: "admin.privacy.update",
      message: "Privacy policy updated",
      data: { adminId: req.user.id },
    });

    return handlers.response.success({
      res,
      code: 200,
      message: "Privacy policy updated successfully",
      data: updated,
    });
  });

  // GET /admin/content/faqs
  listFaqs = catchAsync(async (req, res) => {
    const { page = 1, limit = 25, search = "", status = "active" } = req.query;
    const result = await ContentService.listFaqs({
      page,
      limit,
      search,
      status,
    });
    handlers.logger.success({
      object_type: "admin.content.faq.list",
      message: "Fetched faqs list",
      data: { adminId: req.user.id },
    });
    return handlers.response.success({
      res,
      code: 200,
      message: "Faqs fetched",
      data: result,
    });
  });

  // POST /admin/content/faqs
  createFaq = catchAsync(async (req, res) => {
    const payload = req.body;
    const created = await ContentService.createFaq(payload, req.user.id);
    handlers.logger.success({
      object_type: "admin.content.faq.create",
      message: "Created faq",
      data: { adminId: req.user.id, faqId: created._id },
    });
    return handlers.response.success({
      res,
      code: 201,
      message: "Faq created",
      data: created,
    });
  });

  // GET /admin/content/faqs/:id
  getFaq = catchAsync(async (req, res) => {
    const faqId = req.params.id;
    const faq = await ContentService.getFaq(faqId);
    handlers.logger.success({
      object_type: "admin.content.faq.get",
      message: "Fetched faq",
      data: { adminId: req.user.id, faqId },
    });
    return handlers.response.success({
      res,
      code: 200,
      message: "Faq fetched",
      data: faq,
    });
  });

  // PATCH /admin/content/faqs/:id
  updateFaq = catchAsync(async (req, res) => {
    const faqId = req.params.id;
    const updates = req.body || {};
    const updated = await ContentService.updateFaq(faqId, updates, req.user.id);
    handlers.logger.success({
      object_type: "admin.content.faq.update",
      message: "Updated faq",
      data: { adminId: req.user.id, faqId },
    });
    return handlers.response.success({
      res,
      code: 200,
      message: "Faq updated",
      data: updated,
    });
  });

  // DELETE /admin/content/faqs/:id
  deleteFaq = catchAsync(async (req, res) => {
    const faqId = req.params.id;
    await ContentService.deleteFaq(faqId, req.user.id);
    handlers.logger.success({
      object_type: "admin.content.faq.delete",
      message: "Deleted faq",
      data: { adminId: req.user.id, faqId },
    });
    return handlers.response.success({
      res,
      code: 200,
      message: "Faq deleted",
    });
  });
}

module.exports = new AdminContentController();
