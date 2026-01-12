const Chat = require("../models/Chat");
const Ride = require("../models/RideRequest"); // assuming this exists

class ChatService {
  // Create a new chat message
  static async sendMessage({
    rideId,
    senderId,
    senderRole,
    message = null,
    files = [],
  }) {
    if (!rideId || !senderId || !senderRole) {
      const e = new Error("rideId, senderId, and senderRole are required");
      e.statusCode = 400;
      throw e;
    }

    // fetch ride to get driverId
    const ride = await Ride.findById(rideId).lean();
    if (!ride) {
      const e = new Error("Ride not found");
      e.statusCode = 404;
      throw e;
    }

    const driverId =
      ride.driverId || (senderRole === "driver" ? senderId : null);

    const chat = await Chat.create({
      rideId,
      senderId,
      senderRole,
      driverId,
      message,
      files,
    });

    return chat;
  }

  // Get chat messages for a ride
  static async getMessages(rideId, limit = 50, skip = 0) {
    if (!rideId) throw new Error("rideId required");
    return Chat.find({ rideId })
      .sort({ createdAt: 1 }) // chronological order
      .skip(skip)
      .limit(limit)
      .lean();
  }
}

module.exports = ChatService;
