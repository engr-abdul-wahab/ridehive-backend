// src/middlewares/multer-middleware.js
const multer = require("multer");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");

// Upload API config (can override with env)
const UPLOAD_API_URL =
  process.env.UPLOAD_API_URL || "https://client1.appsstaging.com:3019/upload";
const UPLOAD_API_TOKEN = process.env.UPLOAD_API_TOKEN || ""; // Bearer token if required

// Allowed mime types and size limit (same as before)
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/avi",
  "video/mov",
  "video/wmv",
  "video/flv",
  "video/webm",
  "audio/mp3",
  "audio/wav",
  "audio/ogg",
  "audio/m4a",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

const MAX_FILE_SIZE = Number(process.env.MAX_UPLOAD_SIZE || 50 * 1024 * 1024); // default 50 MB

/**
 * apiStorage is a multer-compatible custom storage engine which streams the file
 * directly to the configured upload API and returns metadata back to multer.
 *
 * The upload API is expected to return JSON in shape:
 * { data: { originalName, size, url, fileKey, ... } }
 *
 * The object we pass to cb(null, info) will become the file object on req.file/req.files.
 */
const apiStorage = {
  _handleFile: function (req, file, cb) {
    try {
      const form = new FormData();

      // include any extra fields required by the API:
      // "projectName" used in your sample — keep it configurable via env
      const projectName =
        process.env.UPLOAD_PROJECT_NAME || "Asuba-Connection-Uploads";
      form.append("projectName", projectName);

      // append file stream (multer provides file.stream)
      // use file.fieldname for field name if needed by API (common is 'file')
      form.append("file", file.stream, {
        filename: file.originalname,
        contentType: file.mimetype,
      });

      // Optional: include other metadata fields that your API expects
      // e.g., user id, folder, etc. Uncomment/adjust if needed:
      // if (req.user && req.user.id) form.append('uploadedBy', String(req.user.id));

      const headers = {
        ...form.getHeaders(),
      };
      if (UPLOAD_API_TOKEN) {
        headers["Authorization"] = `Bearer ${UPLOAD_API_TOKEN}`;
      }

      axios
        .post(UPLOAD_API_URL, form, {
          headers,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          timeout: Number(process.env.UPLOAD_API_TIMEOUT_MS || 60000), // default 60s
        })
        .then((res) => {
          const body = res && res.data ? res.data : null;
          const data = body && body.data ? body.data : null;

          // Normalize response fields so downstream code can rely on them.
          // The API should ideally return: originalName, size, url, fileKey
          const info = {
            // fallback filename: keep the original client filename
            filename:
              (data && data.originalName) || file.originalname || undefined,
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: (data && (data.size || data.fileSize)) || undefined,
            // fileKey is the internal key (S3-like) — used by your DB logic
            key:
              (data && (data.fileKey || data.key)) ||
              (data && data.file_key) ||
              undefined,
            // location / url where the file can be retrieved
            location: (data && (data.url || data.location)) || undefined,
            // include full API response for debugging if needed
            apiResponse: data || body,
          };

          // multer will attach these fields to req.file/req.files
          cb(null, info);
        })
        .catch((err) => {
          console.error(
            "API Upload Error:",
            err && err.message ? err.message : err
          );
          // You can return the axios error or a custom error object
          // If you prefer to not fail the whole request, you could call cb(null, fallbackInfo) instead.
          const error = new Error("Failed to upload file to upload API");
          error.cause = err;
          return cb(error);
        });
    } catch (e) {
      console.error("apiStorage _handleFile exception:", e);
      return cb(e);
    }
  },

  _removeFile: function (req, file, cb) {
    // Optional: implement API-side deletion if supported.
    // For now we simply call cb(null) indicating removal is a no-op.
    cb(null);
  },
};

// Base multer using our apiStorage
const baseMulter = multer({
  storage: apiStorage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) cb(null, true);
    else
      cb(
        new Error(
          "Invalid file type. Only images, videos, audio, and documents are allowed."
        ),
        false
      );
  },
});

// Wrapper to keep the same API you had before (single, array, any, fields, none)
const upload = {
  single: (fieldname) => {
    const multerMiddleware = baseMulter.single(fieldname);
    return (req, res, next) => {
      multerMiddleware(req, res, (err) => {
        if (err) return next(err);

        // req.file already contains the info returned by apiStorage (key, location, etc.)
        // But to be safe, normalize expected fields:
        if (req.file) {
          req.file.key = req.file.key || req.file.fileKey || null;
          req.file.location = req.file.location || req.file.url || null;
        }
        return next();
      });
    };
  },

  array: (fieldname, maxCount) => {
    const multerMiddleware = baseMulter.array(fieldname, maxCount);
    return (req, res, next) => {
      multerMiddleware(req, res, (err) => {
        if (err) return next(err);
        if (req.files && Array.isArray(req.files)) {
          req.files = req.files.map((f) => {
            f.key = f.key || f.fileKey || null;
            f.location = f.location || f.url || null;
            return f;
          });
        }
        return next();
      });
    };
  },

  any: () => {
    const multerMiddleware = baseMulter.any();
    return (req, res, next) => {
      multerMiddleware(req, res, (err) => {
        if (err) return next(err);
        if (req.files && Array.isArray(req.files)) {
          req.files = req.files.map((f) => {
            f.key = f.key || f.fileKey || null;
            f.location = f.location || f.url || null;
            return f;
          });
        }
        if (req.file) {
          req.file.key = req.file.key || req.file.fileKey || null;
          req.file.location = req.file.location || req.file.url || null;
        }
        return next();
      });
    };
  },

  none: () => {
    const multerMiddleware = baseMulter.none();
    return (req, res, next) => {
      multerMiddleware(req, res, (err) => {
        if (err) return next(err);
        return next();
      });
    };
  },

  fields: (fieldsArray) => {
    const multerMiddleware = baseMulter.fields(fieldsArray);
    return (req, res, next) => {
      multerMiddleware(req, res, (err) => {
        if (err) return next(err);

        if (req.files && typeof req.files === "object") {
          Object.keys(req.files).forEach((k) => {
            const arr = req.files[k];
            if (Array.isArray(arr)) {
              req.files[k] = arr.map((f) => {
                f.key = f.key || f.fileKey || null;
                f.location = f.location || f.url || null;
                return f;
              });
            }
          });
        }

        if (req.file) {
          req.file.key = req.file.key || req.file.fileKey || null;
          req.file.location = req.file.location || req.file.url || null;
        }

        return next();
      });
    };
  },

  // expose raw multer instance if needed
  _multer: baseMulter,
};

module.exports = upload;
