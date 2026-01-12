// src/middlewares/auth.js
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { handlers } = require("../utils/handlers");

/**
 * Auth middleware:
 * - verifies JWT
 * - loads user
 * - checks: isDeleted, isActive, tokenInvalidBefore, and lastAuthToken (jti)
 *
 * Keeps existing behavior but adds tokenInvalidBefore and deleted/isActive checks.
 */
module.exports = async (req, res, next) => {
  const authHeader = req.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  if (!token) {
    return handlers.response.unauthorized({
      res,
      message: "Missing authorization token",
    });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return handlers.response.unauthorized({
      res,
      message: "Invalid or expired token",
    });
  }

  try {
    // select additional fields required for new checks
    const user = await User.findById(payload.sub)
      .select("lastAuthToken role tokenInvalidBefore isDeleted isActive")
      .lean();

    if (!user) {
      return handlers.response.unauthorized({
        res,
        message: "Invalid token (user not found)",
      });
    }

    // 1) If account is soft-deleted -> reject
    if (user.isDeleted === true) {
      return handlers.response.unauthorized({
        res,
        message: "Account has been deleted",
      });
    }

    // 2) If account is inactive -> reject
    if (user.isActive === false) {
      return handlers.response.unauthorized({
        res,
        message: "Account is inactive",
      });
    }

    // 3) tokenInvalidBefore check:
    //    If DB has tokenInvalidBefore timestamp, reject tokens issued before that time.
    //    payload.iat is in seconds (JWT standard).
    if (user.tokenInvalidBefore) {
      const tokenIatSeconds = payload.iat || 0;
      const tokenIatMs = Number(tokenIatSeconds) * 1000;
      const invalidBeforeMs = new Date(user.tokenInvalidBefore).getTime();

      if (tokenIatMs < invalidBeforeMs) {
        return handlers.response.unauthorized({
          res,
          message: "Session expired. Please login again.",
        });
      }
    }

    // 4) Existing jti vs lastAuthToken check (preserve original behavior)
    //    If payload.jti missing or does not match stored lastAuthToken -> revoke
    if (!payload.jti || user.lastAuthToken !== payload.jti) {
      return handlers.response.unauthorized({
        res,
        message: "Token has been revoked",
      });
    }

    // attach sanitized user info to req (keep same shape as before)
    req.user = {
      id: payload.sub,
      role: payload.role || user.role,
    };
    req.token = token;

    return next();
  } catch (err) {
    console.error("Auth middleware DB check failed:", err);
    return handlers.response.unauthorized({ res, message: "Invalid token" });
  }
};
