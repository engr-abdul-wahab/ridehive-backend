// src/middlewares/admin-middleware.js
const { handlers } = require("../utils/handlers");

module.exports = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return handlers.response.unauthorized({
      res,
      message: "Admin access required",
    });
  }
  return next();
};
