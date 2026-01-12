const CardService = require("../service/card-service");
const catchAsync = require("../utils/catchAsync");
const { handlers } = require("../utils/handlers");

class CardController {
  constructor() {
    // Bind methods to preserve 'this' context
    this.addCard = this.addCard.bind(this);
    this.listCards = this.listCards.bind(this);
    this.activateCard = this.activateCard.bind(this);
    this.deleteCard = this.deleteCard.bind(this);
  }

  // POST /cards/add-card
  addCard = catchAsync(async (req, res) => {
    const userId = req.user && req.user.id;
    const { paymentMethodId, setDefault } = req.body;

    const result = await CardService.addCard({
      userId,
      paymentMethodId,
      setDefault: setDefault === true || setDefault === "true",
    });

    handlers.logger.success({
      object_type: "card.add",
      message: "Card added",
      data: { userId, cardId: result.id, mongoId: result._id },
    });

    return handlers.response.success({
      res,
      code: 201,
      message: "Card added successfully",
      data: result,
    });
  });

  // GET /cards
  listCards = catchAsync(async (req, res) => {
    const userId = req.user && req.user.id;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;

    const result = await CardService.listCards({ userId, limit });

    handlers.logger.success({
      object_type: "card.list",
      message: "Cards fetched",
      data: { userId, count: result.data.length },
    });

    return handlers.response.success({
      res,
      code: 200,
      message: "Cards fetched successfully",
      data: result,
    });
  });

  // POST /cards/card-activate
  activateCard = catchAsync(async (req, res) => {
    const userId = req.user && req.user.id;
    const { paymentMethodId } = req.body; // get from body

    const result = await CardService.activateCard({ userId, paymentMethodId });

    handlers.logger.success({
      object_type: "card.activate",
      message: "Card activated/set default",
      data: { userId, paymentMethodId },
    });

    return handlers.response.success({
      res,
      code: 200,
      message: "Card set as default",
      data: result,
    });
  });

  // DELETE /cards/delete-card
  deleteCard = catchAsync(async (req, res) => {
    const userId = req.user && req.user.id;
    const { paymentMethodId } = req.body; // from body

    const result = await CardService.deleteCard({ userId, paymentMethodId });

    handlers.logger.success({
      object_type: "card.delete",
      message: "Card deleted/detached",
      data: { userId, paymentMethodId },
    });

    return handlers.response.success({
      res,
      code: 200,
      message: "Card removed successfully",
      data: result,
    });
  });
}

module.exports = new CardController();
