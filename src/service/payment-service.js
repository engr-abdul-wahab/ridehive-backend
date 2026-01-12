const Stripe = require("stripe");
const Payment = require("../models/Payment");
const User = require("../models/User");

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not defined in .env");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2022-11-15",
});

class PaymentService {
  async createPayment({
    userId,
    rideId,
    amountUSD,
    paymentMethodId,
    metadata = {},
  }) {
    if (!userId) throw { statusCode: 400, message: "userId is required" };
    if (!rideId) throw { statusCode: 400, message: "rideId is required" };
    if (!amountUSD || amountUSD <= 0)
      throw { statusCode: 400, message: "amountUSD must be > 0" };
    if (!paymentMethodId)
      throw { statusCode: 400, message: "paymentMethodId is required" };

    const user = await User.findById(userId);
    if (!user || !user.stripeCustomerId)
      throw {
        statusCode: 404,
        message: "User not found or has no Stripe customer",
      };

    // 1️⃣ Create Stripe PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amountUSD * 100), // Stripe works in cents
      currency: "usd",
      customer: user.stripeCustomerId,
      payment_method: paymentMethodId,
      confirm: true, // automatically confirm payment
      metadata: { rideId: rideId.toString(), ...metadata },
    });

    // 2️⃣ Save payment record in MongoDB
    const payment = await Payment.create({
      userId,
      rideId,
      amountUSD,
      status: paymentIntent.status === "succeeded" ? "completed" : "pending",
      paymentId: paymentIntent.id,
      metadata,
    });

    return payment;
  }

  async getPayment(paymentId) {
    const payment = await Payment.findOne({ paymentId });
    if (!payment) throw { statusCode: 404, message: "Payment not found" };
    return payment;
  }
}

module.exports = new PaymentService();
