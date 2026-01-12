// src/middlewares/authSocket.js
const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error("Authentication error"));

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // optionally fetch user (to include role & latest location)
    const user = await User.findById(
      payload.sub || payload.id || payload.userId
    ).lean();
    if (!user) return next(new Error("User not found"));

    socket.user = user;
    return next();
  } catch (err) {
    return next(new Error("Authentication error"));
  }
};
