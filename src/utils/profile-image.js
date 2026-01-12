// src/utils/profile-image.js
const path = require("path");
const { s3Utils } = require("../config/aws-s3");

const APP_BASE_URL = process.env.APP_BASE_URL || "";

function buildProfileImageUrl(key) {
  if (!key) return null;
  const k = String(key).trim();

  // full url or protocol-relative
  if (/^(https?:)?\/\//i.test(k)) return k;

  const looksLikeLocal = k.startsWith("uploads/");

  // If s3 is configured and helper exists, prefer it
  try {
    if (
      s3Utils &&
      typeof s3Utils.isConfigured === "function" &&
      s3Utils.isConfigured() &&
      typeof s3Utils.getFileUrl === "function"
    ) {
      return s3Utils.getFileUrl(k);
    }
  } catch (err) {
    // fall through to other handling
    console.error("s3Utils.getFileUrl failed:", err);
  }

  // local file => make absolute using APP_BASE_URL when available
  if (looksLikeLocal) {
    if (!APP_BASE_URL) return k;
    return `${APP_BASE_URL.replace(/\/+$/, "")}/${k.replace(/^\/+/, "")}`;
  }

  // fallback: return key as-is
  return k;
}

module.exports = { buildProfileImageUrl };
