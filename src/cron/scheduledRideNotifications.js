// src/cron/scheduledRideNotifications.js
const cron = require("node-cron");
const moment = require("moment-timezone");
const RideRequestModel = require("../models/RideRequest");
const sendNotification = require("../utils/sendNotification");

// timezone for global support
const DEFAULT_TIMEZONE = "UTC"; // all stored scheduledAt are UTC

// Helper to get difference in minutes
function diffInMinutes(date1, date2) {
  return Math.round(moment(date1).diff(moment(date2), "minutes"));
}

// Send push/in-app notification helper
async function notifyRide(ride, minutesBefore) {
  const { driverId, userId, meta } = ride;
  if (!driverId || !userId) return;

  const title = `Upcoming Scheduled Ride`;
  const body =
    minutesBefore === 0
      ? `Your scheduled ride is starting now`
      : `Your scheduled ride is in ${minutesBefore} minute${
          minutesBefore > 1 ? "s" : ""
        }`;

  const data = {
    rideId: String(ride._id),
    userId: String(userId),
    driverId: String(driverId),
    rideType: "schedule",
    scheduledTime: meta.schedule.scheduledAt.toISOString(),
    vehicleType: ride.vehicleType,
    from: ride.from,
    to: ride.to,
    minutesBefore,
  };

  console.log(
    `[${moment().tz(DEFAULT_TIMEZONE).format("YYYY-MM-DD HH:mm:ss")}] Sending notification for ride ${ride._id} (${minutesBefore} min before)`
  );

  // Send to driver
  await sendNotification(driverId, { title, body, senderId: userId, data }).catch(
    (err) =>
      console.error(
        `[${moment().tz(DEFAULT_TIMEZONE).format(
          "YYYY-MM-DD HH:mm:ss"
        )}] Driver notification error:`,
        driverId,
        err
      )
  );

  // Send to user
  await sendNotification(userId, { title, body, senderId: driverId, data }).catch(
    (err) =>
      console.error(
        `[${moment().tz(DEFAULT_TIMEZONE).format(
          "YYYY-MM-DD HH:mm:ss"
        )}] User notification error:`,
        userId,
        err
      )
  );

  console.log(
    `[${moment().tz(DEFAULT_TIMEZONE).format("YYYY-MM-DD HH:mm:ss")}] Notifications sent for ride ${ride._id}`
  );
}

// Main cron function
async function scheduledRideNotifications() {
  try {
    const nowUTC = moment.utc();
    console.log(
      `[${moment().tz(DEFAULT_TIMEZONE).format(
        "YYYY-MM-DD HH:mm:ss"
      )}] Checking scheduled rides...`
    );

    const rides = await RideRequestModel.find({
      rideType: "schedule",
      status: "accepted",
      "meta.schedule.scheduledAt": { $exists: true },
    }).lean();

    if (!rides || rides.length === 0) {
      console.log(
        `[${moment().tz(DEFAULT_TIMEZONE).format(
          "YYYY-MM-DD HH:mm:ss"
        )}] No scheduled rides to process.`
      );
      return;
    }

    for (const ride of rides) {
      const scheduledAt = moment.utc(ride.meta.schedule.scheduledAt);
      const minutesDiff = diffInMinutes(scheduledAt, nowUTC);

      // Ensure notification flags exist
      if (!ride.meta.schedule.notifications) {
        ride.meta.schedule.notifications = {
          t_minus_60: false,
          t_minus_30: false,
          t_minus_5: false,
          at_time: false,
        };
      }

      const flags = ride.meta.schedule.notifications;
      const updates = {};

      if (minutesDiff === 60 && !flags.t_minus_60) {
        await notifyRide(ride, 60);
        updates["meta.schedule.notifications.t_minus_60"] = true;
      } else if (minutesDiff === 30 && !flags.t_minus_30) {
        await notifyRide(ride, 30);
        updates["meta.schedule.notifications.t_minus_30"] = true;
      } else if (minutesDiff === 5 && !flags.t_minus_5) {
        await notifyRide(ride, 5);
        updates["meta.schedule.notifications.t_minus_5"] = true;
      } else if (minutesDiff === 0 && !flags.at_time) {
        await notifyRide(ride, 0);
        updates["meta.schedule.notifications.at_time"] = true;
      }

      // Apply updates to ride doc
      if (Object.keys(updates).length > 0) {
        await RideRequestModel.updateOne({ _id: ride._id }, { $set: updates });
        console.log(
          `[${moment().tz(DEFAULT_TIMEZONE).format(
            "YYYY-MM-DD HH:mm:ss"
          )}] Updated notification flags for ride ${ride._id}`
        );
      }
    }
  } catch (err) {
    console.error(
      `[${moment().tz(DEFAULT_TIMEZONE).format(
        "YYYY-MM-DD HH:mm:ss"
      )}] Error in scheduledRideNotifications cron:`,
      err
    );
  }
}

// Schedule cron job: every minute
cron.schedule("* * * * *", () => {
  scheduledRideNotifications();
});

console.log(
  `[${moment().tz(DEFAULT_TIMEZONE).format(
    "YYYY-MM-DD HH:mm:ss"
  )}] Scheduled Ride Notifications Cron Job started (runs every minute)`
);
