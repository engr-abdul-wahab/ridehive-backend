const express = require("express");
const router = express.Router();
const upload = require("../middlewares/multer-middleware");
const auth = require("../middlewares/auth-middleware");
const roleMiddleware = require("../middlewares/role-middleware");
const chatController = require("../controllers/chat-upload-controller");

router.post(
  "/chat-uploads",
  auth,
  roleMiddleware(["user", "driver"]),
  upload.any(),
  chatController.uploadChatFiles
);

module.exports = router;
