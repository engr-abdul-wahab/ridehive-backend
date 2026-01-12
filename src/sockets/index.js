// src/sockets/index.js
const { Server } = require("socket.io");
const socketManager = require("./socket-manager");
const authSocket = require("../middlewares/authSocket"); // your existing socket auth
const userHandler = require("./handlers/user-handler");
const driverHandler = require("./handlers/driver-handler");
const chatHandler = require("./handlers/chat-handler");

function initSocket(server) {
  const io = new Server(server, {
    cors: { origin: "*" },
    pingTimeout: 30000,
  });

  // store io for other modules (services)
  socketManager.init(io);

  // authenticate sockets (attaches socket.user)
  io.use(authSocket);

  io.on("connection", (socket) => {
    console.log(
      "socket connected with socket id",
      socket.id,
      "and user id is :",
      socket.user ? socket.user._id : null
    );
    const user = socket.user;
    if (!user || !user._id) {
      socket.disconnect(true);
      return;
    }

    // Everyone joins a personal room so we can target them: user:<id> or driver:<id>
    if (user.role === "driver") {
      socket.join(`driver:${user._id}`);
      driverHandler.register(socket, io);
    } else {
      socket.join(`user:${user._id}`);
      userHandler.register(socket, io);
    }

    // Register chat handlers (user & driver in ride room can chat)
    chatHandler.register(socket, io);

    socket.on("disconnect", (reason) => {
      console.log(
        "socket disconnected with socket id",
        socket.id,
        "and user id is :",
        user._id,
        "reason:",
        reason
      );
    });
  });

  return io;
}

module.exports = { initSocket };
