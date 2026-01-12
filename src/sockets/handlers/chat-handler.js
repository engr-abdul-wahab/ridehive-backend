const ChatService = require("../../service/chat-service");
const sendNotification = require("../../utils/sendNotification");
const Ride = require("../../models/RideRequest"); 

class ChatHandler {
  static register(socket, io) {
    // User or driver sends a message
    socket.on("chat:send_message", async (payload, ack) => {
      try {
        const { rideId, message = null, files = [] } = payload;
        const senderId = socket.user._id;
        const senderRole = socket.user.role;

        const chat = await ChatService.sendMessage({
          rideId,
          senderId,
          senderRole,
          message,
          files,
        });

        // emit message to the ride room
        io.to(`ride:${rideId}`).emit("chat:new_message", {
          status: true,
          message: "New message received successfully",
          data: chat,
        });

        // if (typeof ack === "function") ack({ status: true, data: chat });
        //Emit to user
        socket.emit("chat:new_message_success", {
          status: true,
          message: "Message sent successfully",
          data: chat,
        });

        // --- SEND NOTIFICATION TO THE OTHER PARTICIPANT ---
        const ride = await Ride.findById(rideId).lean();
        if (ride) {
          let recipientId = null;
          if (senderRole === "driver") {
            recipientId = ride.userId;
          } else if (senderRole === "user") {
            recipientId = ride.driverId;
          }

          if (recipientId && recipientId.toString() !== senderId.toString()) {
            sendNotification(recipientId, {
              title: "New Chat Message",
              body: message || "You received a new message",
              senderId,
              data: {
                rideId: String(rideId),
                chatId: String(chat._id),
                senderId,
                senderRole,
                message,
                files,
              },
            }).catch((err) => {
              console.error(
                "Error sending chat notification to recipient",
                recipientId,
                err
              );
            });
          }
        }
      } catch (err) {
        // console.error("chat:send_message error", err);
        // if (typeof ack === "function")
        //   ack({ status: false, message: err.message });
        socket.emit("chat:send_message error", {
          status: false,
          message: err.message,
        });
      }
    });

    // Fetch previous messages
    socket.on("chat:get_messages", async ({ rideId, limit = 50, skip = 0 }) => {
      try {
        const messages = await ChatService.getMessages(rideId, limit, skip);

        // Emit only to the requesting user
        socket.emit("chat:previous_messages", {
          status: true,
          message: "Messages get successfully",
          data: messages,
        });
      } catch (err) {
        // console.error("chat:get_messages error", err);

        socket.emit("chat:get_messages error", {
          status: false,
          message: err.message,
        });
      }
    });
  }
}

module.exports = ChatHandler;
