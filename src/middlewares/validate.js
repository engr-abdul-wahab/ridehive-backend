// src/middlewares/validate.js
const { validationResult } = require("express-validator");
const { handlers } = require("../utils/handlers");

module.exports = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const payload = errors
      .array()
      .map((err) => ({ field: err.param || err.path, message: err.msg }));
    handlers.logger.failed({
      object_type: "validation",
      message: "Validation failed",
      data: payload,
    });
    return handlers.response.failed({
      res,
      code: 400,
      message: "Validation failed",
      data: payload,
    });
  }
  return next();
};
