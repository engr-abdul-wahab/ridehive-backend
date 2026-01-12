// src/utils/init-admin.js
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { handlers } = require("../utils/handlers");
const config = require("../config"); // optional if you centralize env

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || "10", 10);

async function ensureAdminExists() {
  try {
    const email = process.env.SUPER_ADMIN_EMAIL;
    const password = process.env.SUPER_ADMIN_PASSWORD;
    const fullName = process.env.SUPER_ADMIN_FULLNAME || "Super Admin";

    if (!email || !password) {
      handlers.logger.warn({
        object_type: "init-admin",
        message:
          "SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASSWORD not set; skipping admin creation",
      });
      return;
    }

    // check if an admin user already exists
    let admin = await User.findOne({ email: email.toLowerCase() }).exec();

    if (!admin) {
      const hashed = await bcrypt.hash(String(password), SALT_ROUNDS);
      admin = await User.create({
        email: email.toLowerCase(),
        password: hashed,
        role: "admin",
        fullName,
        isVerified: true,
        profileCompleted: true,
        isActive: true,
        isDeleted: false,
        isAdminApproved: true,
      });

      handlers.logger.success({
        object_type: "init-admin",
        message: "Super admin created",
        data: { email },
      });
      return;
    }

    // if exists but role not admin, upgrade role
    if (admin.role !== "admin") {
      admin.role = "admin";
      admin.isAdminApproved = true;
      await admin.save();
      handlers.logger.success({
        object_type: "init-admin",
        message: "Existing user upgraded to admin",
        data: { email },
      });
      return;
    }

    handlers.logger.success({
      object_type: "init-admin",
      message: "Super admin already exists",
      data: { email },
    });
  } catch (err) {
    handlers.logger.error({
      object_type: "init-admin",
      message: "Failed to ensure admin exists",
      data: err.message,
    });
  }
}

module.exports = { ensureAdminExists };
