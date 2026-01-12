// server.js (project-root-folder/server.js)
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const http = require("http");
const cors = require("cors");
const { handlers } = require("./src/utils/handlers");
const path = require("path");

require("./src/cron/scheduledRideNotifications");

const { ensureAdminExists } = require("./src/utils/init-admin");
const adminRoutes = require("./src/routes/admin/admin-routes");
const adminDashboardRoutes = require("./src/routes/admin/admin-dashboard-routes");
const adminUserRoutes = require("./src/routes/admin/admin-user-routes");
const adminDriverRoutes = require("./src/routes/admin/admin-driver-routes");
const adminVehicleRoutes = require("./src/routes/admin/admin-vehicle-routes");
const adminRideRoutes = require("./src/routes/admin/admin-ride-routes");
const adminContentRoutes = require("./src/routes/admin/admin-content-routes");
const adminRideConfigRoutes = require("./src/routes/admin/admin-ride-config-routes");
const adminNotificatonRoutes = require("./src/routes/admin/admin-notification-routes");
const authRoutes = require("./src/routes/auth-routes");
const profileRoutes = require("./src/routes/profile-routes");
const vehicleRoutes = require("./src/routes/vehicle-routes");
const rideRoutes = require("./src/routes/ride-routes");
const addCardRoutes = require("./src/routes/card-routes");
const addPaymentRoutes = require("./src/routes/payment-routes");
const addReviewsRoutes = require("./src/routes/review-routes");
const chatUploadsRoutes = require("./src/routes/chat-upload-routes");
const addSettingsRoutes = require("./src/routes/settings-routes");
const notificationRoutes = require("./src/routes/notification-routes");

const errorHandler = require("./src/middlewares/errorHandler");
const { initSocket } = require("./src/sockets");

const app = express();

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.use(cors());
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true }));



app.get("/health", (req, res) =>
  handlers.response.success({ res, message: "OK", data: null })
);

// existing REST routes
app.use("/api/admin", adminRoutes);
app.use("/api/admin/dashboard", adminDashboardRoutes);
app.use("/api/admin/users", adminUserRoutes);
app.use("/api/admin/drivers", adminDriverRoutes);
app.use("/api/admin/vehicles", adminVehicleRoutes);
app.use("/api/admin/rides", adminRideRoutes);
app.use("/api/admin/content", adminContentRoutes);
app.use("/api/admin/ride-config", adminRideConfigRoutes);
app.use("/api/admin/notifications", adminNotificatonRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/vehicle", vehicleRoutes);
app.use("/api/cards", addCardRoutes);
app.use("/api/payments", addPaymentRoutes);
app.use("/api/reviews", addReviewsRoutes);
app.use("/api/chat", chatUploadsRoutes);
app.use("/api/settings", addSettingsRoutes);
app.use("/api/rides", rideRoutes);
app.use("/api/notifications", notificationRoutes);

app.use((req, res) =>
  handlers.response.unavailable({ res, message: "Not Found" })
);

// global error handler
app.use(errorHandler);

const MONGO = process.env.MONGO_URI || "mongodb://localhost:27017/myapp";
const PORT = process.env.PORT || 4000;

mongoose
  .connect(MONGO, {})
  .then(async () => {
    handlers.logger.success({
      object_type: "mongoose",
      message: "Connected to MongoDB",
    });

    await ensureAdminExists();

    const server = http.createServer(app);

    // initialize socket.io (attaches to the same server)
    initSocket(server);

    server.listen(PORT, () =>
      handlers.logger.success({
        object_type: "server",
        message: `Server running on port ${PORT}`,
      })
    );
  })
  .catch((err) => {
    handlers.logger.error({
      object_type: "mongoose",
      message: "MongoDB connection error",
      data: err.stack,
    });
    process.exit(1);
  });

module.exports = app;
