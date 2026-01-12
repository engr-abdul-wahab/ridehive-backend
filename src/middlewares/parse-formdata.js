// src/middlewares/parse-formdata.js
const multer = require("multer");
const uploadNone = multer().none(); // parses multipart/form-data text fields

// helper: try to parse JSON safely
function tryParseJSON(value) {
  if (typeof value !== "string") return value;
  const s = value.trim();
  if (
    (s.startsWith("{") && s.endsWith("}")) ||
    (s.startsWith("[") && s.endsWith("]"))
  ) {
    try {
      return JSON.parse(s);
    } catch (e) {
      return value;
    }
  }
  return value;
}

// helper: convert possible string numbers to numbers, flatten nested arrays
function toNumberArray(arrOrVal) {
  if (!arrOrVal) return arrOrVal;
  if (!Array.isArray(arrOrVal)) arrOrVal = [arrOrVal];
  const flattened = arrOrVal.flat();
  return flattened.map((v) => {
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      return Number.isNaN(n) ? v : n;
    }
    return v;
  });
}

// normalize common patterns into req.body.from and req.body.to objects with numeric coordinates
function normalizeLocationField(body, keyPrefix) {
  // 1) if body[keyPrefix] is JSON string
  if (body[keyPrefix] && typeof body[keyPrefix] === "string") {
    const parsed = tryParseJSON(body[keyPrefix]);
    if (typeof parsed === "object") {
      body[keyPrefix] = parsed;
    }
  }

  // Ensure object exists
  body[keyPrefix] = body[keyPrefix] || {};

  // 2) If coordinates exist as a single field (string or array)
  const dotCoords = `${keyPrefix}.coordinates`;
  const bracketCoords = `${keyPrefix}[coordinates]`;
  const bracketCoordsEmpty = `${keyPrefix}[coordinates][]`;

  // case A: body has dot notation key (possible from some clients)
  if (body[dotCoords]) {
    body[keyPrefix].coordinates = toNumberArray(body[dotCoords]);
  }

  // case B: body has bracket key that multer may keep as is
  if (body[bracketCoords]) {
    body[keyPrefix].coordinates = toNumberArray(body[bracketCoords]);
  }

  // case C: repeated keys (from[coordinates][]) become an array under same key
  if (body[bracketCoordsEmpty]) {
    body[keyPrefix].coordinates = toNumberArray(body[bracketCoordsEmpty]);
  }

  // case D: if coordinates exist inside object but as strings -> coerce
  if (body[keyPrefix] && Array.isArray(body[keyPrefix].coordinates)) {
    body[keyPrefix].coordinates = toNumberArray(body[keyPrefix].coordinates);
  }

  // case E: handle keys like 'from.coordinates[0]' 'from.coordinates[1]'
  const indexed = Object.keys(body)
    .filter(
      (k) =>
        k.startsWith(`${keyPrefix}.coordinates`) ||
        k.startsWith(`${keyPrefix}[coordinates]`)
    )
    .reduce((acc, k) => {
      // try extracting index
      const m = k.match(/\[(\d+)\]$/) || k.match(/\.coordinates\.(\d+)$/);
      const idx = m ? Number(m[1]) : null;
      if (idx !== null) {
        acc[idx] = body[k];
      } else {
        // push if no index
        acc.push(body[k]);
      }
      return acc;
    }, []);

  if (indexed.length) {
    body[keyPrefix].coordinates = toNumberArray(indexed);
  }

  // 3) coerce vehicle address fields to string if needed
  if (body[keyPrefix].address && typeof body[keyPrefix].address !== "string") {
    body[keyPrefix].address = String(body[keyPrefix].address);
  }
}

module.exports = (req, res, next) => {
  // Only process multipart/form-data; if JSON, skip multer
  const ct = (req.headers["content-type"] || "").toLowerCase();
  if (ct.includes("multipart/form-data")) {
    return uploadNone(req, res, (err) => {
      if (err) return next(err);

      try {
        // Parse JSON-like fields if provided as strings
        ["from", "to"].forEach((k) => {
          if (req.body && typeof req.body[k] === "string") {
            req.body[k] = tryParseJSON(req.body[k]);
          }
        });

        // Normalize coordinates for both from/to
        normalizeLocationField(req.body, "from");
        normalizeLocationField(req.body, "to");

        // Normalize vehicleType: treat empty string as missing so notEmpty() triggers
        if (req.body && req.body.vehicleType === "")
          delete req.body.vehicleType;

        return next();
      } catch (e) {
        return next(e);
      }
    });
  }

  // For non-multipart (application/json or x-www-form-urlencoded), still try to coerce nested JSON strings
  try {
    ["from", "to"].forEach((k) => {
      if (req.body && typeof req.body[k] === "string") {
        req.body[k] = tryParseJSON(req.body[k]);
      }
    });

    // If coordinates are present but strings, coerce
    if (req.body && req.body.from && Array.isArray(req.body.from.coordinates)) {
      req.body.from.coordinates = toNumberArray(req.body.from.coordinates);
    }
    if (req.body && req.body.to && Array.isArray(req.body.to.coordinates)) {
      req.body.to.coordinates = toNumberArray(req.body.to.coordinates);
    }

    if (req.body && req.body.vehicleType === "") delete req.body.vehicleType;
  } catch (e) {
    // ignore
  }

  return next();
};
