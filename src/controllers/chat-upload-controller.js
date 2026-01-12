const chatService = require("../service/chat-upload-service");
const { handlers } = require("../utils/handlers");
const catchAsync = require("../utils/catchAsync");

class ChatController {
  uploadChatFiles = catchAsync(async (req, res) => {
    const clientIp = req.ip || req.headers["x-forwarded-for"]?.split(",")[0];

    const files = req.files || [];
    if (files.length === 0) {
      return handlers.response.error({
        res,
        code: 400,
        message: "No files uploaded",
      });
    }

    const { chatId, rideId } = req.body;

    const result = await chatService.uploadFiles({
      files,
      user: req.user,
      chatId,
      rideId,
      ip: clientIp,
      userAgent: req.get("User-Agent"),
    });

    handlers.logger.success({
      object_type: "chat.files.upload",
      message: result.message,
      data: result.data || null,
    });

    return handlers.response.success({
      res,
      code: 200,
      message: result.message,
      data: result.data || null,
    });
  });
}

module.exports = new ChatController();
