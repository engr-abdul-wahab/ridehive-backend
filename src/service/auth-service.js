const mongoose = require("mongoose");
const { OAuth2Client } = require("google-auth-library");
const AppleAuth = require("apple-signin-auth");
const config = require("../config");
const OTP = require("../models/OTP");
const { validationResult } = require("express-validator");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const { handlers } = require("../utils/handlers");
const { createAndSendOtp } = require("../utils/otp");
const { sign } = require("../utils/jwt");
const { v4: uuidv4 } = require("uuid");
const { s3Utils } = require("../config/aws-s3");
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2022-11-15",
});

const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 10);
const RESEND_COOLDOWN = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 60); // seconds

const JWT_SECRET = process.env.JWT_SECRET || "replace_with_secure_secret";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

const RESET_TOKEN_SECRET =
  process.env.JWT_RESET_SECRET || process.env.JWT_SECRET;
const RESET_TOKEN_EXPIRES = process.env.JWT_RESET_EXPIRES || "15m";
const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES || 10);

const OTP_RESEND_COOLDOWN = Number(
  process.env.OTP_RESEND_COOLDOWN_SECONDS || 60
); // seconds

const APP_BASE_URL = process.env.APP_BASE_URL || "";
class AuthService {
  constructor() {
    this.googleClient = new OAuth2Client(config.google.clientId || "");
  }

  async signUp(data) {
    const { body } = data;
    const {
      email,
      password,
      confirmPassword,
      role = "user",
      termsAccepted,
      deviceType,
      deviceToken,
    } = body;

    if (
      !termsAccepted ||
      !(
        termsAccepted === true ||
        termsAccepted === "true" ||
        termsAccepted === "1"
      )
    ) {
      const err = new Error("Terms must be accepted");
      err.statusCode = 400;
      throw err;
    }
    if (!email || !password || !confirmPassword) {
      const err = new Error("Missing required fields");
      err.statusCode = 400;
      throw err;
    }
    if (password !== confirmPassword) {
      const err = new Error("Passwords do not match");
      err.statusCode = 400;
      throw err;
    }

    const existing = await User.findOne({ email });
    if (existing) {
      const err = new Error("Email already registered");
      err.statusCode = 400;
      throw err;
    }

    const hashed = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    const user = await User.create({
      email,
      password: hashed,
      role,
      deviceType,
      deviceToken,
    });

    try {
      await createAndSendOtp(user, { type: "verify" });
    } catch (otpErr) {
      return {
        userId: user._id,
        email: user.email,
        role: user.role,
        otpSent: 0,
        otpError: "Failed to send OTP",
      };
    }

    return {
      userId: user._id,
      email: user.email,
      role: user.role,
      otpSent: 1,
    };
  }

  async verifyOtp(data) {
    const { body } = data;
    const { userId, code, type = "verify" } = body;

    // --- Validations ---
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      const err = new Error("Invalid userId");
      err.statusCode = 400;
      throw err;
    }
    if (!code || String(code).trim().length !== 6) {
      const err = new Error("OTP code is required and must be 6 digits");
      err.statusCode = 400;
      throw err;
    }
    if (!["verify", "reset"].includes(type)) {
      const err = new Error("Invalid type");
      err.statusCode = 400;
      throw err;
    }

    // --- Find user ---
    const user = await User.findById(userId).exec();
    if (!user) {
      const err = new Error("User not found");
      err.statusCode = 404;
      throw err;
    }
    if (type === "verify" && user.isVerified) {
      const err = new Error("Email already verified");
      err.statusCode = 400;
      throw err;
    }

    const normalizedCode = String(code).trim();

    // --- Validate OTP record ---
    const record = await OTP.findOne({
      user: userId,
      code: normalizedCode,
      type,
      used: false,
    })
      .sort({ createdAt: -1 })
      .exec();

    if (!record) {
      const last = await OTP.findOne({ user: userId, type })
        .sort({ createdAt: -1 })
        .exec();
      if (!last)
        throw Object.assign(
          new Error("No OTP found. Please request a new code."),
          { statusCode: 400 }
        );
      if (last.expiresAt && last.expiresAt < new Date())
        throw Object.assign(
          new Error("OTP expired. Please request a new code."),
          { statusCode: 400 }
        );
      if (last.used)
        throw Object.assign(
          new Error("OTP already used. Please request a new code."),
          { statusCode: 400 }
        );
      throw Object.assign(
        new Error(
          "Invalid OTP code. Please check and try again or request a new code."
        ),
        { statusCode: 400 }
      );
    }

    // --- Expiry check ---
    if (record.expiresAt && record.expiresAt < new Date()) {
      record.used = true;
      record.usedAt = new Date();
      await record.save().catch(() => {});
      const err = new Error("OTP expired. Please request a new code.");
      err.statusCode = 400;
      throw err;
    }

    record.used = true;
    record.usedAt = new Date();
    await record.save();

    // invalidate other unused OTPs
    await OTP.updateMany(
      { user: userId, type, _id: { $ne: record._id }, used: false },
      { $set: { used: true, usedAt: new Date() } }
    )
      .exec()
      .catch(() => {});

    // --- JWT setup ---
    const secret =
      type === "reset"
        ? process.env.JWT_RESET_SECRET || process.env.JWT_SECRET
        : process.env.JWT_SECRET;

    if (!secret) {
      const err = new Error("Server misconfiguration (missing JWT secret)");
      err.statusCode = 500;
      throw err;
    }

    const expiresIn =
      type === "reset"
        ? process.env.JWT_RESET_EXPIRES || "15m"
        : process.env.JWT_EXPIRES_IN || "7d";

    // payload + jti handling
    let payload;
    let jti = null;

    if (type === "reset") {
      payload = { id: userId, purpose: "reset" };
    } else {
      // normal auth / verify token -> include sub, role and jti
      jti = uuidv4();

      payload = {
        sub: String(user._id || userId),
        role: (user && user.role) || "user",
        jti,
      };
    }

    // sign token
    const token = jwt.sign(payload, secret, { expiresIn });
    console.log(jti);
    // --- Update user for verify type (and persist jti for auth tokens) ---
    const updates = {};
    if (type === "verify") {
      updates.isVerified = true;
    }
    if (jti) {
      // store latest token id so middleware can validate jti
      updates.lastAuthToken = jti;
    }

    if (Object.keys(updates).length > 0) {
      try {
        // update and return fresh user if needed; we don't rely on the returned doc here
        await User.findByIdAndUpdate(userId, { $set: updates }).exec();
      } catch (e) {
        console.error("Failed updating user during token build:", e);
        // non-fatal — decide if you want to throw here; safest is to continue but log
      }
    }

    // --- Fetch full user object without password ---
    const fullUser = await User.findById(userId).select("-password").lean();

    // --- Build unified response ---
    const response = {
      message: "OTP verified successfully",
      data: {
        token,
        expiresIn,
        user: fullUser,
      },
    };

    // Add "next" route only for verify type
    if (type === "verify") {
      response.data.next = "/create-profile";
    }

    return response;
  }

  async resendOtp(data) {
    const { body } = data;
    const { userId, email, type = "verify" } = body;

    // 1) Basic validation (service-level)
    if (!userId && !email) {
      const err = new Error("Either userId or email is required");
      err.statusCode = 400;
      throw err;
    }

    if (!["verify", "reset"].includes(type)) {
      const err = new Error("Invalid OTP type");
      err.statusCode = 400;
      throw err;
    }

    // 2) Resolve user by userId or email
    let user = null;
    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        const err = new Error("Invalid userId");
        err.statusCode = 400;
        throw err;
      }
      user = await User.findById(userId).exec();
    } else if (email) {
      user = await User.findOne({ email: String(email).toLowerCase() }).exec();
    }

    if (!user) {
      const err = new Error("User not found");
      err.statusCode = 404;
      throw err;
    }

    // 3) Block resend if user already verified (only for verify-type)
    if (type === "verify" && user.isVerified) {
      const err = new Error("Email already verified. No need to resend OTP.");
      err.statusCode = 400;
      throw err;
    }

    // 4) Cooldown logic (to avoid spamming)
    const lastOtp = await OTP.findOne({ user: user._id, type })
      .sort({ createdAt: -1 })
      .exec();
    if (lastOtp) {
      const secondsSinceLastOtp =
        (Date.now() - new Date(lastOtp.createdAt).getTime()) / 1000;
      if (secondsSinceLastOtp < RESEND_COOLDOWN) {
        const waitTime = Math.ceil(RESEND_COOLDOWN - secondsSinceLastOtp);
        const err = new Error(
          `Please wait ${waitTime} second(s) before requesting a new code`
        );
        err.statusCode = 429; // Too Many Requests
        throw err;
      }
    }

    // 5) Invalidate older unused OTPs for same user+type
    try {
      await OTP.updateMany(
        { user: user._id, type, used: false },
        { $set: { used: true, usedAt: new Date() } }
      ).exec();
    } catch (e) {
      // non-fatal, continue — optionally log with handlers.logger
    }

    // 6) Generate and send new OTP
    try {
      await createAndSendOtp(user, { type }); // expects helper to persist OTP and send email
      return {
        message: "OTP resent successfully",
        data: { userId: user._id, otpSent: 1 },
      };
    } catch (sendErr) {
      console.error("OTP send failed:", sendErr);
      const err = new Error("Failed to send OTP. Please try again later.");
      err.statusCode = 500;
      throw err;
    }
  }

  async login(data) {
    const { body } = data || {};
    const { email, password, role, deviceType, deviceToken } = body || {};

    // validation
    if (!email || !password) {
      const err = new Error("Email and password are required");
      err.statusCode = 400;
      throw err;
    }

    // find user and explicitly include password field (in case schema uses select:false)
    const user = await User.findOne({
      email: String(email).toLowerCase(),
    })
      .select("+password")
      .exec();

    if (!user) {
      const err = new Error("Invalid credentials");
      err.statusCode = 400;
      throw err;
    }

    // optional: enforce caller-supplied role if provided
    if (role && user.role !== role) {
      const err = new Error("Role mismatched");
      err.statusCode = 403;
      throw err;
    }

    // --- robust password handling ---
    // ensure plain password is a string
    const plain = typeof password === "string" ? password : String(password);

    // get stored hash and tolerate common shapes (string or { hash: '...' } etc.)
    let storedHash = user.password;

    if (storedHash && typeof storedHash === "object") {
      if (typeof storedHash.hash === "string") storedHash = storedHash.hash;
      else if (typeof storedHash.password === "string")
        storedHash = storedHash.password;
      else {
        console.error("Unexpected user.password shape:", storedHash);
        const err = new Error("Invalid credentials");
        err.statusCode = 400;
        throw err;
      }
    }

    // if still missing/invalid -> fail
    if (!storedHash || typeof storedHash !== "string") {
      console.error(
        "Missing or invalid stored password for user:",
        user._id,
        "storedPassword:",
        storedHash
      );
      const err = new Error("Invalid credentials");
      err.statusCode = 400;
      throw err;
    }

    // verify password
    const isMatch = await bcrypt.compare(plain, storedHash);
    if (!isMatch) {
      const err = new Error("Invalid credentials");
      err.statusCode = 400;
      throw err;
    }

    // ---- OPTIONAL: update device info on login ----
    if (deviceType || deviceToken) {
      const updatePayload = {};

      if (deviceType) updatePayload.deviceType = deviceType;
      if (deviceToken) updatePayload.deviceToken = deviceToken;

      // update DB
      await User.findByIdAndUpdate(user._id, {
        $set: updatePayload,
      }).exec();

      // ✅ sync in-memory user object
      if (deviceType) user.deviceType = deviceType;
      if (deviceToken) user.deviceToken = deviceToken;
    }

    // If account is soft-deleted -> block login
    if (user.isDeleted === true) {
      return {
        status: 0,
        message:
          "Account deleted. Please contact support if you believe this is an error.",
        data: {
          userId: user._id,
        },
      };
    }

    // If account is inactive -> block login
    if (user.isActive === false) {
      return {
        status: 0,
        message:
          "Account is inactive. Please contact support to reactivate your account.",
        data: {
          userId: user._id,
        },
      };
    }

    // verified guard
    if (user.isVerified === false) {
      return {
        status: 0,
        message:
          "Email not verified. Please verify your email before logging in.",
        data: {
          userId: user._id,
        },
      };
    }

    // convert to plain object and strip sensitive fields
    const userData = user.toObject
      ? user.toObject()
      : JSON.parse(JSON.stringify(user));
    if (userData.password) delete userData.password;
    if (userData.lastAuthToken) delete userData.lastAuthToken;
    if (userData.__v !== undefined) delete userData.__v;

    // helper: build public URL for profileImageKey
    const buildProfileImageUrl = (key) => {
      if (!key) return null;
      const k = String(key).trim();
      if (/^(https?:)?\/\//i.test(k)) return k;
      if (k.startsWith("uploads/")) {
        const base =
          (process.env.APP_BASE_URL &&
            String(process.env.APP_BASE_URL).trim()) ||
          "http://localhost:4000";
        try {
          return `${base.replace(/\/$/, "")}/${k.replace(/^\/+/, "")}`;
        } catch (e) {
          console.error("buildProfileImageUrl: failed building local URL", e);
          return null;
        }
      }
      if (
        typeof s3Utils === "object" &&
        typeof s3Utils.getFileUrl === "function"
      ) {
        try {
          return s3Utils.getFileUrl(k);
        } catch (e) {
          console.error("s3Utils.getFileUrl failed (non-fatal):", e);
          return null;
        }
      }
      return null;
    };

    try {
      userData.profileImageUrl = userData.profileImageKey
        ? buildProfileImageUrl(userData.profileImageKey)
        : null;
    } catch (e) {
      console.error("Failed to compute profileImageUrl (non-fatal):", e);
      userData.profileImageUrl = null;
    }

    // helper to sign JWT (avoid duplication)
    const issueJwt = async () => {
      if (!process.env.JWT_SECRET || !process.env.JWT_EXPIRES_IN) {
        const err = new Error("JWT_SECRET or JWT_EXPIRES_IN not configured");
        err.statusCode = 500;
        throw err;
      }

      // Create unique token ID (jti)
      const jti = uuidv4();

      // Payload includes jti (use 'sub' for subject)
      const payload = { sub: String(user._id), role: user.role, jti };

      // Sign JWT
      const token = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN,
      });

      // Save the latest jti to the user document
      await User.findByIdAndUpdate(user._id, {
        $set: { lastAuthToken: jti },
      }).exec();

      // base response
      return {
        status: 1,
        message: "Login successful",
        data: {
          token,
          expiresIn: process.env.JWT_EXPIRES_IN,
          user: userData,
        },
      };
    };

    // ---------- ROLE-SPECIFIC FLOW ----------
    // For drivers, run Stripe onboarding/capability checks but DO NOT block token issuance.
    if (user.role === "driver") {
      // prepare default driver response (onboarding fields null by default)
      let response;
      try {
        // Try to issue token regardless of stripe state
        response = await issueJwt();

        // If user has no stripeAccountId — include onboarding info
        if (!user.stripeAccountId) {
          response.data.onboardingUrl = null;
          response.data.onboardingReason = "no_stripe_account";
          return response;
        }

        // Retrieve Stripe account and check transfers capability
        const account = await stripe.accounts.retrieve(user.stripeAccountId);
        const transfersCapability =
          account.capabilities && account.capabilities.transfers;

        if (transfersCapability !== "active") {
          // create onboarding link for the existing connected account (if possible)
          let onboardingUrl = null;
          try {
            const accountLink = await stripe.accountLinks.create({
              account: user.stripeAccountId,
              refresh_url: `${process.env.APP_BASE_URL}/merchant/setup`,
              return_url: `${process.env.APP_BASE_URL}/merchant/thank-you`,
              type: "account_onboarding",
            });
            onboardingUrl = accountLink.url;
          } catch (linkErr) {
            console.error(
              "Failed to create Stripe account link:",
              linkErr && linkErr.message ? linkErr.message : linkErr
            );
            onboardingUrl = null;
          }

          response.data.onboardingUrl = onboardingUrl;
          response.data.onboardingReason = "capability_incomplete";
          return response;
        }

        // transfers active: onboarding not required
        response.data.onboardingUrl = null;
        response.data.onboardingReason = null;
        return response;
      } catch (stripeErr) {
        // If Stripe API error occurs, still return token but set stripeCheckFailed
        console.error(
          "Stripe API error during login:",
          stripeErr && stripeErr.message ? stripeErr.message : stripeErr
        );

        // Ensure we still have a token response
        const baseResponse = response || (await issueJwt());
        baseResponse.data.stripeCheckFailed = true;
        baseResponse.data.stripeErrorMessage =
          stripeErr && stripeErr.message
            ? stripeErr.message
            : "Stripe API error";
        // If we haven't set onboarding fields, set them to null for clarity
        if (baseResponse.data.onboardingUrl === undefined)
          baseResponse.data.onboardingUrl = null;
        if (baseResponse.data.onboardingReason === undefined)
          baseResponse.data.onboardingReason = null;
        return baseResponse;
      }
    }

    // Non-driver users (user/admin) -> always issue JWT and onboarding fields null
    const publicResp = await issueJwt();
    publicResp.data.onboardingUrl = null;
    publicResp.data.onboardingReason = null;
    return publicResp;
  }

  async forgotPassword(data) {
    const { body } = data;
    const { email } = body;

    if (!email) {
      const err = new Error("Email is required");
      err.statusCode = 400;
      throw err;
    }

    // Find user by email
    const user = await User.findOne({
      email: String(email).toLowerCase(),
    }).exec();
    if (!user) {
      // To avoid user enumeration you could return success here.
      const err = new Error("User not found");
      err.statusCode = 404;
      throw err;
    }

    // Check last reset OTP for cooldown
    const last = await OTP.findOne({ user: user._id, type: "reset" })
      .sort({ createdAt: -1 })
      .exec();
    if (last) {
      const secondsSince =
        (Date.now() - new Date(last.createdAt).getTime()) / 1000;

      // If cooldown hasn't passed, ask user to wait
      if (secondsSince < OTP_RESEND_COOLDOWN) {
        const wait = Math.ceil(OTP_RESEND_COOLDOWN - secondsSince);
        const err = new Error(
          `Please wait ${wait} second(s) before requesting a new code`
        );
        err.statusCode = 429; // Too Many Requests
        throw err;
      }
    }

    // Invalidate any older unused reset OTPs before creating a new one
    try {
      await OTP.updateMany(
        { user: user._id, type: "reset", used: false },
        { $set: { used: true, usedAt: new Date() } }
      ).exec();
    } catch (e) {
      // non-fatal: log if you have logger, but continue to create new OTP
      // console.warn('Failed to invalidate old OTPs', e);
    }

    // Create + send a fresh OTP (createAndSendOtp should persist the OTP with expiresAt)
    try {
      await createAndSendOtp(user, {
        type: "reset",
        expiresInMinutes: OTP_EXPIRY_MINUTES,
      });
      return {
        message: "OTP sent to registered email",
        data: { userId: user._id, otpSent: true },
      };
    } catch (e) {
      const err = new Error("Failed to send OTP. Please try again later.");
      err.statusCode = 500;
      throw err;
    }
  }

  // 2) Verify reset OTP: reuses verify logic but specifically for reset type
  async verifyResetOtp(data) {
    const { body } = data;
    const { userId, code } = body;

    // Basic checks
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      const err = new Error("Invalid userId");
      err.statusCode = 400;
      throw err;
    }
    if (!code || String(code).trim().length !== 6) {
      const err = new Error("OTP code is required and must be 6 digits");
      err.statusCode = 400;
      throw err;
    }

    // Find user
    const user = await User.findById(userId).exec();
    if (!user) {
      const err = new Error("User not found");
      err.statusCode = 404;
      throw err;
    }

    // Find latest matching unused OTP record of type 'reset'
    const normalizedCode = String(code).trim();
    const record = await OTP.findOne({
      user: userId,
      code: normalizedCode,
      type: "reset",
      used: false,
    })
      .sort({ createdAt: -1 })
      .exec();

    if (!record) {
      const last = await OTP.findOne({ user: userId, type: "reset" })
        .sort({ createdAt: -1 })
        .exec();
      if (!last) {
        const err = new Error("No OTP found. Please request a new code.");
        err.statusCode = 400;
        throw err;
      }
      if (last.expiresAt && last.expiresAt < new Date()) {
        const err = new Error("OTP expired. Please request a new code.");
        err.statusCode = 400;
        throw err;
      }
      if (last.used) {
        const err = new Error("OTP already used. Please request a new code.");
        err.statusCode = 400;
        throw err;
      }
      const err = new Error(
        "Invalid OTP code. Please try again or request a new code."
      );
      err.statusCode = 400;
      throw err;
    }

    // Check expiry of matched record
    if (record.expiresAt && record.expiresAt < new Date()) {
      record.used = true;
      record.usedAt = new Date();
      await record.save().catch(() => {});
      const err = new Error("OTP expired. Please request a new code.");
      err.statusCode = 400;
      throw err;
    }

    // Mark used
    record.used = true;
    record.usedAt = new Date();
    await record.save();

    // Optionally mark other unused reset OTPs as used
    try {
      await OTP.updateMany(
        { user: userId, type: "reset", _id: { $ne: record._id }, used: false },
        { $set: { used: true, usedAt: new Date() } }
      ).exec();
    } catch (e) {}

    // Issue short-lived reset token (JWT) for password reset endpoint
    if (!RESET_TOKEN_SECRET) {
      const err = new Error(
        "Server misconfiguration (missing reset token secret)"
      );
      err.statusCode = 500;
      throw err;
    }

    const resetToken = jwt.sign(
      { id: userId, purpose: "reset" },
      RESET_TOKEN_SECRET,
      { expiresIn: RESET_TOKEN_EXPIRES }
    );

    return { message: "OTP verified", data: { resetToken } };
  }

  // 3) Reset password using resetToken
  async resetPassword(data) {
    const { body } = data;
    const { resetToken, password } = body;

    if (!resetToken) {
      const err = new Error("resetToken is required");
      err.statusCode = 400;
      throw err;
    }
    if (!password || password.length < 6) {
      const err = new Error("Password must be at least 8 characters");
      err.statusCode = 400;
      throw err;
    }

    if (!RESET_TOKEN_SECRET) {
      const err = new Error(
        "Server misconfiguration (missing reset token secret)"
      );
      err.statusCode = 500;
      throw err;
    }

    // Verify token
    let payload;
    try {
      payload = jwt.verify(resetToken, RESET_TOKEN_SECRET);
    } catch (e) {
      const err = new Error("Invalid or expired reset token");
      err.statusCode = 400;
      throw err;
    }

    if (!payload || payload.purpose !== "reset" || !payload.id) {
      const err = new Error("Invalid reset token payload");
      err.statusCode = 400;
      throw err;
    }

    const userId = payload.id;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      const err = new Error("Invalid user in token");
      err.statusCode = 400;
      throw err;
    }

    // Find user
    const user = await User.findById(userId).exec();
    if (!user) {
      const err = new Error("User not found");
      err.statusCode = 404;
      throw err;
    }

    // Hash new password and save
    const hashed = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    user.password = hashed;
    // optionally unset isVerified=false? no — keep current verification state
    await user.save();

    // Optionally: mark all reset OTPs for user as used
    try {
      await OTP.updateMany(
        { user: userId, type: "reset", used: false },
        { $set: { used: true, usedAt: new Date() } }
      ).exec();
    } catch (e) {}

    return { message: "Password reset successful", data: { userId: user._id } };
  }

  // Verify Google idToken and return normalized payload with fullName & profileImage
  async verifyGoogleIdToken(idToken) {
    if (!idToken) throw new Error("Google idToken missing");

    const ticket = await this.googleClient.verifyIdToken({
      idToken,
      audience: config.google.clientId,
    });

    const payload = ticket.getPayload();

    return {
      socialId: payload.sub,
      email: payload.email,
      fullName: payload.name, // mapped to your schema field
      profileImage: payload.picture, // mapped to your schema field
    };
  }

  // Verify Apple identityToken and return normalized payload with fullName & profileImage
  async verifyAppleIdentityToken(identityToken) {
    if (!identityToken) throw new Error("Apple identity token missing");

    // apple-signin-auth verifyIdToken returns payload or throws
    const payload = await AppleAuth.verifyIdToken(identityToken, {
      audience: config.apple.clientId,
      ignoreExpiration: false,
    });

    // NOTE: Apple often does not return 'name' after first sign-in; handle accordingly.
    return {
      socialId: payload.sub,
      email: payload.email,
      fullName: payload.name || undefined,
      profileImage: undefined,
    };
  }

  /**
   * social login where frontend supplies socialToken (socialId)
   * returns { token, user, message }
   */
  async socialLogin({
    role,
    socialToken,
    socialType,
    deviceToken,
    deviceType,
    fullName,
    email,
    phone,
    profileImage,
  }) {
    // Basic guards (controller/validator also checks)
    if (!role) {
      const e = new Error("Role field can't be empty");
      e.statusCode = 400;
      throw e;
    }
    if (!socialToken) {
      const e = new Error("User social token field can't be empty");
      e.statusCode = 400;
      throw e;
    }
    if (!socialType) {
      const e = new Error("User social type field can't be empty");
      e.statusCode = 400;
      throw e;
    }

    // normalize email if present
    const normalizedEmail = email
      ? String(email).toLowerCase().trim()
      : undefined;

    // Step A: check email conflict: if email exists with different role => reject
    if (normalizedEmail) {
      const userByEmail = await User.findOne({ email: normalizedEmail });
      if (userByEmail && userByEmail.role && userByEmail.role !== role) {
        const e = new Error(
          "Sign in with an email that is already registered witih another role"
        );
        e.statusCode = 409;
        throw e;
      }
    }

    // Step B: try to find user by socialId first to avoid duplicates
    let user = await User.findOne({ socialId: socialToken });

    // Step C: fallback: find by email if socialId not found
    if (!user && normalizedEmail) {
      user = await User.findOne({ email: normalizedEmail });
    }

    // Step D: if found and isDeleted => return Account is deleted (no token)
    if (user && user.isDeleted) {
      const e = new Error("Account is deleted");
      e.statusCode = 403;
      throw e;
    }

    // Step E: If user does not exist, create one
    let created = false;
    if (!user) {
      const safeRole =
        role === "admin" && process.env.ALLOW_ADMIN_FROM_CLIENT !== "true"
          ? "user"
          : role;

      const newUser = new User({
        fullName: fullName || undefined,
        email: normalizedEmail,
        phone: phone || undefined,
        socialId: socialToken,
        socialType: socialType,
        role: safeRole,
        deviceToken: deviceToken || undefined,
        deviceType: deviceType || undefined,
        profileImageKey: profileImage || undefined,
        isVerified: true, // as requested: mark new user verified
        profileCompleted: false, // default false
        isDeleted: false,
      });

      const jti = uuidv4();
      const payload = {
        sub: String(newUser._id),
        role: newUser.role,
        jti,
      };

      // sign token (uses your normal auth secret & expiry)
      const token = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN,
      });

      newUser.lastAuthToken = jti;
      await newUser.save();

      created = true;
      // sanitize user for response
      const sanitized = this.sanitizeUser(newUser);
      // message depends on profileCompleted (new user => false)
      const message =
        sanitized.profileCompleted === false
          ? "Profile is not completed"
          : "Login successfully";

      return { token, user: sanitized, message, created };
    }

    // Step F: existing user found
    // If role mismatch (should be caught earlier by email check), double-check socialId owner role
    if (user.role && user.role !== role) {
      const e = new Error(
        "Sign in with an email that is already registered witih another role"
      );
      e.statusCode = 409;
      throw e;
    }

    // If user.isDeleted become true, blocked earlier. Re-check in case.
    if (user.isDeleted) {
      const e = new Error("Account is deleted");
      e.statusCode = 403;
      throw e;
    }

    // Update user basic fields (do not overwrite with nulls)
    user.fullName = user.fullName || fullName || user.fullName;
    user.email = user.email || normalizedEmail || user.email;
    user.phone = user.phone || phone || user.phone;
    user.socialId = user.socialId || socialToken;
    user.socialType = user.socialType || socialType;
    // do not allow role escalation to admin from client
    if (["user", "driver"].includes(role)) user.role = role;
    else if (role === "admin" && process.env.ALLOW_ADMIN_FROM_CLIENT === "true")
      user.role = "admin";
    if (deviceToken) user.deviceToken = deviceToken;
    if (deviceType) user.deviceType = deviceType;
    if (profileImage) user.profileImageKey = profileImage;

    const jti = uuidv4();
    const payload = {
      sub: String(user._id),
      role: user.role,
      jti,
    };

    // sign token (uses your normal auth secret & expiry)
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN,
    });

    user.lastAuthToken = jti;
    await user.save();

    const sanitized = this.sanitizeUser(user);

    const message =
      sanitized.profileCompleted === false
        ? "Profile is not completed"
        : "Login successfully";

    return { token, user: sanitized, message, created };
  }

  sanitizeUser(userDoc) {
    if (!userDoc) return null;

    // convert to plain object; remove versionKey via option so __v is gone
    const u = userDoc.toObject
      ? userDoc.toObject({ versionKey: false })
      : Object.assign({}, userDoc);

    // explicit removals (safe even if fields are null/undefined)
    delete u.password;
    delete u.lastAuthToken;
    // __v already removed by toObject({ versionKey: false }), but keep defensive:
    if (u.__v !== undefined) delete u.__v;

    return u;
  }

  async logout(data) {
    const { user } = data || {};
    const userId = user ? user.id || user._id : null;

    if (!userId) {
      const err = new Error("Unauthorized");
      err.statusCode = 401;
      throw err;
    }

    await User.findByIdAndUpdate(userId, { $set: { lastAuthToken: null } });

    return {
      status: 1,
      message: "Logout successful",
      data: { userId },
    };
  }
}

module.exports = new AuthService();
