// src/sockets/socket-manager.js
let ioInstance = null;

class SocketManager {
  init(io) {
    ioInstance = io;
  }

  getIo() {
    return ioInstance;
  }
}

module.exports = new SocketManager();
