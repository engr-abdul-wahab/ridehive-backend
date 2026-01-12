// src/middlewares/errorHandler.js
const { handlers } = require("../utils/handlers");

module.exports = (err, req, res, next) => {
  // normalize
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal server error";

  // detailed logging (stack) for server errors
  if (statusCode >= 500) {
    handlers.logger.error({ object_type: "global", message, data: err.stack });
    return handlers.response.error({ res, code: statusCode, message });
  }

  // client errors
  handlers.logger.failed({ object_type: "global", message, data: err.stack });
  return handlers.response.failed({ res, code: statusCode, message });
};
