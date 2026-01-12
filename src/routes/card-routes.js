const express = require("express");
const router = express.Router();
const cardController = require("../controllers/card-controller");
const validate = require("../middlewares/validate");
const {
  addCardValidation,
  activateCardValidation,
  deleteCardValidation,
} = require("../validations/card-validation");
const auth = require("../middlewares/auth-middleware");
const roleMiddleware = require("../middlewares/role-middleware");
const upload = require("../middlewares/multer-middleware");

// Add a card
router.post(
  "/add-card",
  auth,
  roleMiddleware("user"),
  upload.none(),
  addCardValidation,
  validate,
  cardController.addCard
);

// List cards
router.get(
  "/cards-list",
  auth,
  roleMiddleware("user"),
  cardController.listCards
);

// Activate card
router.post(
  "/card-activate",
  auth,
  roleMiddleware("user"),
  upload.none(),
  activateCardValidation,
  validate,
  cardController.activateCard
);

// Delete card (pass paymentMethodId in body)
router.delete(
  "/delete-card",
  auth,
  roleMiddleware("user"),
  upload.none(),
  deleteCardValidation,
  validate,
  cardController.deleteCard
);

module.exports = router;
