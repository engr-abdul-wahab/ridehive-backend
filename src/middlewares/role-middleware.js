// src/middlewares/role-middleware.js
const { handlers } = require("../utils/handlers");

/**
 * Role-based access middleware
 * @param {string|string[]} allowedRoles - Role or array of roles allowed to access the route
 */
module.exports = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return handlers.response.unauthorized({
        res,
        message: "Authentication required",
      });
    }

    // normalize to array
    const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    if (!rolesArray.includes(req.user.role)) {
      return handlers.response.unauthorized({
        res,
        message: `${req.user.role || "User"} access not allowed`,
      });
    }

    next();
  };
};
