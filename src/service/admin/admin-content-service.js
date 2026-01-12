// services/admin/admin-content-service.js
const Content = require("../../models/Content");
const Faq = require("../../models/Faq");
const { isValidObjectId, Types } = require("mongoose");

class AdminContentService {
  constructor() {}

  /**
   * Terms & Conditions Helpers
   * We store terms as a Content document with type = "terms_and_conditions"
   */

  async getTerms() {
    const doc = await Content.findOne({ type: "terms_and_conditions" })
      .lean()
      .exec();
    if (!doc) {
      // return an empty default structure so UI can render
      return {
        type: "terms_and_conditions",
        title: "",
        content: "",
        is_active: false,
        meta: { version: "1.0", language: "en" },
      };
    }
    return doc;
  }

  /**
   * updates the terms document (creates if not exists)
   * allowed updates: title, content, is_active, meta (language/version)
   */
  async updateTerms(updates = {}, adminId = null) {
    const allowed = ["title", "content", "is_active", "meta"];
    const payload = {};
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(updates, k))
        payload[k] = updates[k];
    }

    // minimal validation
    if (payload.title !== undefined && typeof payload.title !== "string") {
      const e = new Error("title must be a string");
      e.statusCode = 400;
      throw e;
    }
    if (payload.content !== undefined && typeof payload.content !== "string") {
      const e = new Error("content must be a string");
      e.statusCode = 400;
      throw e;
    }

    const opts = { upsert: true, new: true, setDefaultsOnInsert: true };
    const doc = await Content.findOneAndUpdate(
      { type: "terms_and_conditions" },
      { $set: { ...payload, type: "terms_and_conditions" } },
      opts
    )
      .lean()
      .exec();

    return doc;
  }

  // Get content by type (terms / privacy)
  async getContentByType(type) {
    const content = await Content.findOne({ type, is_active: true }).lean();
    if (!content) {
      const e = new Error(`${type} not found`);
      e.statusCode = 404;
      throw e;
    }
    return content;
  }

  // Update content by type
  async updatePrivacy(updates = {}, adminId = null) {
    const allowed = ["title", "content", "is_active", "meta"];
    const payload = {};

    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(updates, k)) {
        payload[k] = updates[k];
      }
    }

    // Minimal validation
    if (payload.title !== undefined && typeof payload.title !== "string") {
      const e = new Error("title must be a string");
      e.statusCode = 400;
      throw e;
    }
    if (payload.content !== undefined && typeof payload.content !== "string") {
      const e = new Error("content must be a string");
      e.statusCode = 400;
      throw e;
    }
    if (
      payload.is_active !== undefined &&
      typeof payload.is_active !== "boolean"
    ) {
      const e = new Error("is_active must be a boolean");
      e.statusCode = 400;
      throw e;
    }

    const opts = { upsert: true, new: true, setDefaultsOnInsert: true };
    const doc = await Content.findOneAndUpdate(
      { type: "privacy_policy" },
      { $set: { ...payload, type: "privacy_policy" } },
      opts
    )
      .lean()
      .exec();

    return doc;
  }
  /**
   * FAQ operations
   */

  async listFaqs({
    page = 1,
    limit = 25,
    search = "",
    status = "active",
  } = {}) {
    const q = {};
    if (status && status !== "all") q.status = status;
    if (search && String(search).trim().length) {
      const s = String(search).trim();
      q.$or = [
        { question: { $regex: s, $options: "i" } },
        { answer: { $regex: s, $options: "i" } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [total, items] = await Promise.all([
      Faq.countDocuments(q),
      Faq.find(q)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
    ]);

    const pages = Math.max(1, Math.ceil(total / Number(limit) || 1));
    return {
      meta: { page: Number(page), limit: Number(limit), total, pages },
      items,
    };
  }

  async createFaq(payload = {}, adminId = null) {
    const { question, answer, status = "active" } = payload;
    if (!question || typeof question !== "string") {
      const e = new Error("question is required and must be a string");
      e.statusCode = 400;
      throw e;
    }
    if (!answer || typeof answer !== "string") {
      const e = new Error("answer is required and must be a string");
      e.statusCode = 400;
      throw e;
    }
    if (!["active", "inactive"].includes(status)) {
      const e = new Error("status must be active|inactive");
      e.statusCode = 400;
      throw e;
    }

    const faq = new Faq({
      question: question.trim(),
      answer: answer.trim(),
      status,
    });
    await faq.save();
    return faq.toObject();
  }

  async getFaq(faqId) {
    if (!isValidObjectId(faqId)) {
      const e = new Error("Invalid faq id");
      e.statusCode = 400;
      throw e;
    }
    const faq = await Faq.findById(faqId).lean().exec();
    if (!faq) {
      const e = new Error("Faq not found");
      e.statusCode = 404;
      throw e;
    }
    return faq;
  }

  async updateFaq(faqId, updates = {}, adminId = null) {
    if (!isValidObjectId(faqId)) {
      const e = new Error("Invalid faq id");
      e.statusCode = 400;
      throw e;
    }

    const allowed = ["question", "answer", "status"];
    const payload = {};
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(updates, k)) {
        payload[k] = updates[k];
      }
    }

    if (payload.status && !["active", "inactive"].includes(payload.status)) {
      const e = new Error("status must be active|inactive");
      e.statusCode = 400;
      throw e;
    }

    const faq = await Faq.findById(faqId).exec();
    if (!faq) {
      const e = new Error("Faq not found");
      e.statusCode = 404;
      throw e;
    }

    let changed = false;

    for (const k of Object.keys(payload)) {
      let val = payload[k];

      // normalize string values
      if (typeof val === "string") {
        val = val.trim();
      }

      if (val === "" || val === undefined || val === null) {
        continue;
      }

      if (faq[k] === undefined || String(faq[k]) !== String(val)) {
        faq[k] = val;
        changed = true;
      }
    }

    if (!changed) return faq.toObject();

    await faq.save();
    return faq.toObject();
  }

  async deleteFaq(faqId, adminId = null) {
    if (!isValidObjectId(faqId)) {
      const e = new Error("Invalid faq id");
      e.statusCode = 400;
      throw e;
    }
    const faq = await Faq.findById(faqId).exec();
    if (!faq) {
      const e = new Error("Faq not found");
      e.statusCode = 404;
      throw e;
    }
    await Faq.deleteOne({ _id: faqId }).exec();
    return;
  }
}

module.exports = new AdminContentService();
