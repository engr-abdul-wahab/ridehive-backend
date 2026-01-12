const authService = require("../service/auth-service");
const { handlers } = require("../utils/handlers");
const catchAsync = require("../utils/catchAsync");

class AuthController {
  signUp = catchAsync(async (req, res) => {
    const result = await authService.signUp({
      body: req.body,
      files: req.files,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });

    handlers.logger.success({
      object_type: "auth.signup",
      message: "User signed up",
      data: result,
    });
    return handlers.response.success({
      res,
      code: 201,
      message: "User created. OTP sent to email.",
      data: result,
    });
  });

  // src/controllers/auth-controller.js
  verifyOtp = catchAsync(async (req, res) => {
    const result = await authService.verifyOtp({
      body: req.body,
      files: req.files,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });

    // If token present, log issuance (do NOT log token value)
    if (result && result.data && result.data.token) {
      handlers.logger.success({
        object_type: "auth.verifyOtp",
        message: "OTP verified and JWT issued",
        data: {
          userId: result.data.user.id,
          role: result.data.user.role,
          expiresIn: result.data.expiresIn,
        },
      });
    } else {
      handlers.logger.success({
        object_type: "auth.verifyOtp",
        message: result.message,
        data: result.data || null,
      });
    }

    return handlers.response.success({
      res,
      code: 200,
      message: result.message || "OTP verified",
      data: result.data || null,
    });
  });

  resendOtp = catchAsync(async (req, res) => {
    const result = await authService.resendOtp({
      body: req.body,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });

    handlers.logger.success({
      object_type: "auth.resendOtp",
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

  login = catchAsync(async (req, res) => {
    const result = await authService.login({
      body: req.body,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });

    // extract onboarding info safely for logging
    const onboardingUrl =
      result && result.data ? result.data.onboardingUrl : null;
    const onboardingReason =
      result && result.data ? result.data.onboardingReason : null;

    handlers.logger.success({
      object_type: "auth.login",
      // message varies depending on status and onboarding
      message:
        result && result.status === 1
          ? "User logged in"
          : result && result.status === 0 && onboardingReason
          ? `Login issued but onboarding required (${onboardingReason})`
          : "Login attempt processed",
      data: {
        id:
          result && result.data && result.data.user
            ? result.data.user.id
            : undefined,
        onboardingUrl,
        onboardingReason,
      },
    });

    // Send exactly what the service returned
    return res.status(200).json(result);
  });

  // POST /api/auth/forgot-password
  forgotPassword = catchAsync(async (req, res) => {
    const result = await authService.forgotPassword({
      body: req.body,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });

    handlers.logger.success({
      object_type: "auth.forgotPassword",
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

  // POST /api/auth/verify-reset-otp
  verifyResetOtp = catchAsync(async (req, res) => {
    const result = await authService.verifyResetOtp({
      body: req.body,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });

    handlers.logger.success({
      object_type: "auth.verifyResetOtp",
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

  // POST /api/auth/reset-password
  resetPassword = catchAsync(async (req, res) => {
    const result = await authService.resetPassword({
      body: req.body,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });

    handlers.logger.success({
      object_type: "auth.resetPassword",
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

  /**
   * POST /auth/social-login
   * body: { socialType, idToken, role?, deviceToken?, deviceType?, device_os?, meta? }
   */
  socialLogin = catchAsync(async (req, res) => {
    const {
      role,
      socialToken,
      socialType,
      deviceToken,
      deviceType,
      fullName,
      email,
      phone,
      profileImage,
    } = req.body;

    try {
      const result = await authService.socialLogin({
        role,
        socialToken,
        socialType,
        deviceToken,
        deviceType,
        fullName,
        email,
        phone,
        profileImage,
      });

      // result: { token, user, message, created }
      return handlers.response.success({
        res,
        code: 200,
        message: result.message,
        data: {
          token: result.token,
          user: result.user,
        },
      });
    } catch (err) {
      // Use handlers to log and respond
      handlers.logger.failed({
        object_type: "auth.social_login",
        message: err.message,
        data: { role, socialToken, socialType, email },
      });

      const code = err.statusCode || 500;
      return handlers.response.failed({
        res,
        code,
        message: err.message || "Something went wrong",
        data: null,
      });
    }
  });

  logout = catchAsync(async (req, res) => {
    const result = await authService.logout({
      body: req.body,
      user: req.user || null, // optional, if JWT middleware attaches user
    });

    handlers.logger.success({
      object_type: "auth.logout",
      message: "User logged out successfully",
      data: {
        id: result.data && result.data.userId ? result.data.userId : undefined,
      },
    });

    return res.status(200).json(result);
  });
}

module.exports = new AuthController();
