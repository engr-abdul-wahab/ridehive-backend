// src/validations/vehicle-validation.js
const { body } = require("express-validator");

const RIDE_OPTIONS_MAP = {
  "car standard": "car_standard",
  car_standard: "car_standard",
  "car deluxe": "car_deluxe",
  car_deluxe: "car_deluxe",
  "motorcycle standard": "motorcycle_standard",
  motorcycle_standard: "motorcycle_standard",
};

function normalizeRideOption(val) {
  if (!val) return val;
  const lower = String(val).trim().toLowerCase();
  return RIDE_OPTIONS_MAP[lower] || val;
}

const ALLOWED_FILE_MIME = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
];

const MAX_FILE_SIZE = Number(
  process.env.MAX_UPLOAD_SIZE_BYTES || 10 * 1024 * 1024
);

/**
 * Helper to check a single file field in req.files.
 * Throws an Error with a clear message on validation failure.
 */
function fileFieldValidator(fieldName, opts = {}) {
  return body(fieldName).custom((_, { req }) => {
    // multer fields are in req.files as arrays: { fieldName: [fileObj] }
    const arr = req.files?.[fieldName];
    const file = Array.isArray(arr) && arr.length ? arr[0] : null;

    if (!file) {
      // attach error to the same field name
      throw new Error(`${fieldName} image/file is required`);
    }

    // basic structure
    if (!file.mimetype) {
      throw new Error(`${fieldName} file is invalid`);
    }

    // mime check
    if (!ALLOWED_FILE_MIME.includes(file.mimetype)) {
      throw new Error(`${fieldName} must be an image (jpeg/png/webp) or pdf`);
    }

    // size check (multer should normally enforce this)
    if (typeof file.size === "number" && file.size > MAX_FILE_SIZE) {
      throw new Error(
        `${fieldName} exceeds maximum allowed size of ${Math.round(
          MAX_FILE_SIZE / (1024 * 1024)
        )} MB`
      );
    }

    return true;
  });
}

exports.createVehicleValidation = [
  // textual fields
  body("carMakeModel")
    .trim()
    .notEmpty()
    .withMessage("carMakeModel is required")
    .isLength({ max: 200 })
    .withMessage("carMakeModel too long"),

  body("color")
    .trim()
    .notEmpty()
    .withMessage("color is required")
    .isLength({ max: 50 })
    .withMessage("color too long"),

  body("specification")
    .trim()
    .notEmpty()
    .withMessage("specification is required")
    .isLength({ max: 2000 })
    .withMessage("specification too long"),

  body("vehicleType")
    .trim()
    .notEmpty()
    .withMessage("vehicleType is required")
    .isLength({ max: 100 })
    .withMessage("vehicleType too long"),

  body("licensePlateNumber")
    .trim()
    .notEmpty()
    .withMessage("licensePlateNumber is required")
    .isLength({ max: 50 })
    .withMessage("licensePlateNumber too long"),

  body("rideOption")
    .trim()
    .notEmpty()
    .withMessage("rideOption is required")
    .customSanitizer(normalizeRideOption)
    .isIn(["car_standard", "car_deluxe", "motorcycle_standard"])
    .withMessage(
      "rideOption must be one of: car standard, car deluxe, motorcycle standard"
    ),

  // file fields - each validator attaches error to proper param (field name)
  fileFieldValidator("licensePlate"),
  fileFieldValidator("vehiclePicture"),
  fileFieldValidator("driverLicense"),
  fileFieldValidator("vehicleRegistration"),
  fileFieldValidator("taxiOperatorLicense"),
  fileFieldValidator("insuranceCard"),
];
