const Stripe = require("stripe");
const User = require("../models/User");
const UserCard = require("../models/UserCard");

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not defined in .env");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2022-11-15",
});

class CardService {
  async addCard({ userId, paymentMethodId, setDefault = false }) {
    if (!userId) throw { statusCode: 400, message: "userId is required" };
    if (!paymentMethodId)
      throw { statusCode: 400, message: "paymentMethodId is required" };

    const user = await User.findById(userId);
    if (!user) throw { statusCode: 404, message: "User not found" };

    // Create Stripe customer if not exists
    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user._id.toString() },
      });
      stripeCustomerId = customer.id;
      user.stripeCustomerId = stripeCustomerId;
      await user.save();
    }

    // Attach card to Stripe customer
    const pm = await stripe.paymentMethods.attach(paymentMethodId, {
      customer: stripeCustomerId,
    });

    // Set default if requested
    if (setDefault) {
      await stripe.customers.update(stripeCustomerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });

      // unset previous default in MongoDB
      await UserCard.updateMany(
        { userId, isDefault: true },
        { isDefault: false }
      );
    }

    // Save card in MongoDB
    const cardRecord = await UserCard.create({
      userId,
      stripePaymentMethodId: pm.id,
      brand: pm.card.brand,
      last4: pm.card.last4,
      expMonth: pm.card.exp_month,
      expYear: pm.card.exp_year,
      isDefault: setDefault,
      billingDetails: pm.billing_details || {},
    });

    return {
      _id: cardRecord._id,
      id: pm.id,
      card: {
        brand: pm.card.brand,
        last4: pm.card.last4,
        exp_month: pm.card.exp_month,
        exp_year: pm.card.exp_year,
      },
      billing_details: pm.billing_details,
      isDefault: cardRecord.isDefault,
      created: cardRecord.createdAt,
    };
  }

  async listCards({ userId, limit = 10 }) {
    if (!userId) throw { statusCode: 400, message: "userId is required" };

    const cards = await UserCard.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return {
      data: cards.map((c) => ({
        _id: c._id,
        id: c.stripePaymentMethodId,
        card: {
          brand: c.brand,
          last4: c.last4,
          exp_month: c.expMonth,
          exp_year: c.expYear,
        },
        billing_details: c.billingDetails,
        isDefault: c.isDefault,
        created: c.createdAt,
      })),
      defaultPaymentMethod:
        cards.find((c) => c.isDefault)?.stripePaymentMethodId || null,
    };
  }

  async activateCard({ userId, paymentMethodId }) {
    if (!userId) throw { statusCode: 400, message: "userId is required" };
    if (!paymentMethodId)
      throw { statusCode: 400, message: "paymentMethodId is required" };

    const card = await UserCard.findOne({
      stripePaymentMethodId: paymentMethodId,
      userId,
    });
    if (!card) throw { statusCode: 404, message: "Card not found" };

    // Set default in Stripe
    const user = await User.findById(userId);
    if (!user || !user.stripeCustomerId)
      throw { statusCode: 404, message: "User or Stripe customer not found" };

    await stripe.customers.update(user.stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    // Update MongoDB — set this as default
    await UserCard.updateMany(
      { userId, isDefault: true },
      { isDefault: false }
    );
    card.isDefault = true;
    await card.save();

    return {
      _id: card._id,
      id: card.stripePaymentMethodId,
      card: {
        brand: card.brand,
        last4: card.last4,
        exp_month: card.expMonth,
        exp_year: card.expYear,
      },
      billing_details: card.billingDetails,
      isDefault: card.isDefault,
      created: card.createdAt,
    };
  }

  async deleteCard({ userId, paymentMethodId }) {
    if (!userId) throw { statusCode: 400, message: "userId is required" };
    if (!paymentMethodId)
      throw { statusCode: 400, message: "paymentMethodId is required" };

    // find the mongo record by stripe paymentMethod id
    const card = await UserCard.findOne({
      stripePaymentMethodId: paymentMethodId,
      userId,
    });
    if (!card) throw { statusCode: 404, message: "Card not found" };

    // Detach from Stripe
    await stripe.paymentMethods.detach(card.stripePaymentMethodId);

    // If this card was default, try to promote another card or clear default in Stripe
    if (card.isDefault) {
      // look for another card to promote
      const another = await UserCard.findOne({
        userId,
        _id: { $ne: card._id },
      }).sort({ createdAt: -1 });

      if (another) {
        // set new default in Stripe
        const user = await User.findById(userId);
        if (user && user.stripeCustomerId) {
          await stripe.customers.update(user.stripeCustomerId, {
            invoice_settings: {
              default_payment_method: another.stripePaymentMethodId,
            },
          });
        }
        // update mongo flags
        await UserCard.updateMany({ userId }, { $set: { isDefault: false } });
        another.isDefault = true;
        await another.save();
      } else {
        // no other card - clear default in Stripe
        const user = await User.findById(userId);
        if (user && user.stripeCustomerId) {
          await stripe.customers.update(user.stripeCustomerId, {
            invoice_settings: { default_payment_method: null },
          });
        }
      }
    }

    // Remove from MongoDB
    await card.deleteOne();

    return {
      stripePaymentMethodId: paymentMethodId,
      mongoId: card._id,
      detached: true,
    };
  }
}

module.exports = new CardService();
