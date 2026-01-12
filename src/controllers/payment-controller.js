const catchAsync = require("../utils/catchAsync");
const { handlers } = require("../utils/handlers");
const PaymentService = require("../service/payment-service");

class PaymentController {
  constructor() {
    this.createPayment = this.createPayment.bind(this);
    this.getPayment = this.getPayment.bind(this);
  }

  // POST /payments
  createPayment = catchAsync(async (req, res) => {
    const userId = req.user && req.user.id;
    const { rideId, amountUSD, paymentMethodId, metadata } = req.body;

    const payment = await PaymentService.createPayment({
      userId,
      rideId,
      amountUSD,
      paymentMethodId,
      metadata,
    });

    handlers.logger.success({
      object_type: "payment.create",
      message: "Payment created successfully",
      data: payment,
    });

    return handlers.response.success({
      res,
      code: 201,
      message: "Payment processed successfully",
      data: payment,
    });
  });

  // GET /payments/:paymentId
  getPayment = catchAsync(async (req, res) => {
    const { paymentId } = req.params;

    const payment = await PaymentService.getPayment(paymentId);

    handlers.logger.success({
      object_type: "payment.get",
      message: "Payment fetched successfully",
      data: payment,
    });

    return handlers.response.success({
      res,
      code: 200,
      message: "Payment fetched successfully",
      data: payment,
    });
  });
}

module.exports = new PaymentController();
