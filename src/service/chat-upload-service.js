const path = require("path");
const { s3Utils } = require("../config/aws-s3");
const APP_BASE_URL = process.env.APP_BASE_URL || "";
const Chat = require("../models/Chat");

class ChatUploadService {
  async uploadFiles(data) {
    const { files, user, chatId, rideId, ip } = data;

    if (!user) {
      const err = new Error("Unauthorized: user not found");
      err.statusCode = 401;
      throw err;
    }

    const userId = user._id || user.id;
    if (!userId) {
      const err = new Error("Unauthorized: user ID missing");
      err.statusCode = 401;
      throw err;
    }

    if (!files || files.length === 0) {
      const err = new Error("No files uploaded");
      err.statusCode = 400;
      throw err;
    }

    // If chatId is provided, find the chat
    let chatDoc = null;
    if (chatId) {
      chatDoc = await Chat.findById(chatId);
      if (!chatDoc) {
        const err = new Error("Chat not found for provided chatId");
        err.statusCode = 404;
        throw err;
      }
    }

    const uploadedFiles = [];

    for (const file of files) {
      // Determine file key (S3 or local)
      let fileKey = file.key || file.filename || null;
      if (!fileKey && file.path) {
        const rel = path.relative(process.cwd(), file.path).replace(/\\/g, "/");
        fileKey = rel.startsWith("uploads/") ? rel : `uploads/${rel}`;
      }

      // Determine file URL
      let fileUrl = null;
      if (file.location) {
        fileUrl = file.location;
      } else if (fileKey) {
        const looksLikeFullUrl = /^(https?:)?\/\//i.test(fileKey);
        const looksLikeLocal = fileKey.startsWith("uploads/");

        if (looksLikeFullUrl) {
          fileUrl = fileKey;
        } else if (!looksLikeLocal && s3Utils?.isConfigured?.()) {
          try {
            fileUrl = s3Utils.getFileUrl(fileKey);
          } catch (e) {
            console.error("s3Utils.getFileUrl failed:", e);
            fileUrl = null;
          }
        } else {
          fileUrl = `${APP_BASE_URL}/${fileKey}`.replace(/([^:]\/)\/+/g, "$1");
        }
      }

      const fileData = {
        key: fileKey || null,
        url: fileUrl || null,
        originalname: file.originalname || null,
        mimetype: file.mimetype || null,
        size: Number(file.size || 0),
      };

      uploadedFiles.push(fileData);

      // If chat exists, push to files array
      if (chatDoc) {
        chatDoc.files.push(fileData);
      }
    }

    // Save chat if updated
    if (chatDoc) await chatDoc.save();

    return {
      message:
        uploadedFiles.length > 1
          ? "Files uploaded successfully"
          : "File uploaded successfully",
      data: uploadedFiles.length === 1 ? uploadedFiles[0] : uploadedFiles,
    };
  }
}

module.exports = new ChatUploadService();
