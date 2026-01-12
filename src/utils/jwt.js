// src/utils/jwt.js
const jwt = require("jsonwebtoken");
const secret = process.env.JWT_SECRET || "secret";
const expiresIn = process.env.JWT_EXPIRES_IN || "7d";

function sign(payload) {
  return jwt.sign(payload, secret, { expiresIn });
}
function verify(token) {
  return jwt.verify(token, secret);
}

module.exports = { sign, verify };
