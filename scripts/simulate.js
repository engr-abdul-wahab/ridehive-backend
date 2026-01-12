// scripts/simulate.js
// Usage: node scripts/simulate.js
//
// Make sure your server is running on http://localhost:4000
// and that you replace DRIVER_JWT and USER_JWT with valid tokens
// that your authSocket middleware will accept.

const { io } = require("socket.io-client");

const SOCKET_URL = process.env.SOCKET_URL || "http://localhost:4000";

// TODO: set these JWTs to valid tokens for a driver user and a normal user
const DRIVER_JWT = process.env.DRIVER_JWT || "DRIVER_JWT_HERE";
const USER_JWT = process.env.USER_JWT || "USER_JWT_HERE";

// Helper: create socket with auth token
function connectSocket(token, label) {
  const socket = io(SOCKET_URL, {
    transports: ["websocket"],
    auth: { token },
    reconnection: false,
    timeout: 20000,
  });

  socket.on("connect", () => console.log(`[${label}] connected:`, socket.id));
  socket.on("connect_error", (err) =>
    console.error(`[${label}] connect_error:`, err.message)
  );
  socket.on("disconnect", (reason) =>
    console.log(`[${label}] disconnected:`, reason)
  );
  return socket;
}

// Simulate
(async function main() {
  console.log(
    "Starting simulation. Make sure server is running and JWTs are valid."
  );
  const driverSocket = connectSocket(DRIVER_JWT, "DRIVER");
  const userSocket = connectSocket(USER_JWT, "USER");

  // Wire driver listeners
  driverSocket.on("ride:new_request", (payload) => {
    console.log(
      "[DRIVER] received ride:new_request",
      payload.rideId,
      "from user",
      payload.userId,
      "distanceFromDriverMiles=",
      payload.distanceFromDriverMiles
    );
    // Auto accept after short delay
    setTimeout(() => {
      console.log("[DRIVER] accepting ride", payload.rideId);
      driverSocket.emit("ride:accept", { rideId: payload.rideId }, (ack) => {
        console.log("[DRIVER] accept ack", ack);
      });
    }, 1500);
  });

  driverSocket.on("ride:accepted_success", (d) => {
    console.log("[DRIVER] got ride:accepted_success", d);
  });

  driverSocket.on("ride:location_update", (d) => {
    console.log("[DRIVER] ride:location_update", d);
  });

  // Wire user listeners
  userSocket.on("drivers:nearby_result", (res) => {
    console.log("[USER] drivers:nearby_result", res);
  });
  userSocket.on("ride:request_sent", (d) => {
    console.log("[USER] ride:request_sent", d);
  });
  userSocket.on("ride:status_update", (data) => {
    console.log("[USER] ride:status_update", data);
    // When driver accepted, join ride room (optional)
    if (data && data.rideId) {
      userSocket.emit("ride:join", { rideId: data.rideId }, (ack) => {
        console.log("[USER] joined ride room", ack);
      });
    }
  });
  userSocket.on("ride:driver_arrived", (d) =>
    console.log("[USER] ride:driver_arrived", d)
  );
  userSocket.on("ride:location_update", (d) =>
    console.log("[USER] ride:location_update", d)
  );
  userSocket.on("ride:started", (d) => console.log("[USER] ride:started", d));
  userSocket.on("ride:completed", (d) =>
    console.log("[USER] ride:completed", d)
  );

  // Wait until both connected
  await new Promise((resolve) => {
    const check = () => {
      if (driverSocket.connected && userSocket.connected) return resolve();
      setTimeout(check, 200);
    };
    check();
  });

  // Start driver sending periodic live location updates
  let driverCoords = [-74.00597, 40.712776]; // example starting point
  const sendDriverLocation = () => {
    driverSocket.emit(
      "driver:update_location",
      { coordinates: driverCoords, isAvailable: true },
      (ack) => {
        // ack not used, server emits driver:update_ok event
      }
    );
  };

  // start interval
  const locInterval = setInterval(() => {
    // move coordinates slightly (simulate driving)
    driverCoords = [driverCoords[0] + 0.001, driverCoords[1] + 0.0005];
    sendDriverLocation();
  }, 2000);

  // USER asks for nearby drivers (after a moment)
  setTimeout(() => {
    // ask for drivers near a point (close to driver's coords)
    userSocket.emit(
      "drivers:nearby",
      { coords: [-74.00597, 40.712776], radiusMiles: 30, max: 10 },
      (ack) => {
        console.log("[USER] drivers:nearby ack", ack);
        if (ack.ok && ack.data && ack.data.length) {
          // choose first driver and send ride request
          const first = ack.data[0];
          const payload = {
            userId: userSocket.userId || "SIM_USER", // optional: your server may check this against token
            rideType: "instant",
            vehicleType: "car_standard",
            from: {
              coordinates: [-74.00597, 40.712776],
              address: "From Location",
            },
            to: { coordinates: [-73.935242, 40.73061], address: "To Location" },
            distanceMiles: 3.9,
            fareUSD: 7.81,
            radiusMiles: 30,
            maxDrivers: 10,
          };
          console.log("[USER] sending ride:send_request", payload);
          // If your server requires payload.userId to match token payload, ensure you set it correctly.
          // If not sure, server can use socket.user._id instead.
          userSocket.emit("ride:send_request", payload, (ack2) => {
            console.log("[USER] ride:send_request ack", ack2);
          });
        } else {
          console.log("[USER] no drivers nearby in ack");
        }
      }
    );
  }, 3000);

  // After driver accepts, script will simulate arrival/start/end by listening to events.
  // Listen for driver accepted event on driver side and then simulate subsequent steps.
  driverSocket.on("ride:accepted_success", async (d) => {
    const rideId = d.rideId;
    console.log("[SIM] driver accepted ride", rideId);

    // simulate "arrived at pickup" after 2s
    setTimeout(() => {
      console.log("[DRIVER] emitting ride:arrived");
      driverSocket.emit(
        "ride:arrived",
        {
          rideId,
          location: { coordinates: driverCoords, address: "Pickup Address" },
        },
        (ack) => {
          console.log("[DRIVER] arrived ack", ack);
        }
      );
    }, 2000);

    // simulate "start ride" after 4s
    setTimeout(() => {
      console.log("[DRIVER] emitting ride:start");
      driverSocket.emit(
        "ride:start",
        { rideId, startLocation: { coordinates: driverCoords } },
        (ack) => {
          console.log("[DRIVER] start ack", ack);
        }
      );
    }, 4000);

    // simulate moving and then "end ride" after 12s
    setTimeout(() => {
      // move driver to near dropoff
      driverCoords = [-73.935242, 40.73061];
      sendDriverLocation(); // send final update
      console.log("[DRIVER] emitting ride:end");
      driverSocket.emit(
        "ride:end",
        { rideId, endLocation: { coordinates: driverCoords }, finalFare: 8.0 },
        (ack) => {
          console.log("[DRIVER] end ack", ack);
        }
      );

      // cleanup and exit after short delay
      setTimeout(() => {
        clearInterval(locInterval);
        console.log("[SIM] ending simulation in 3s");
        driverSocket.disconnect();
        userSocket.disconnect();
        setTimeout(() => process.exit(0), 3000);
      }, 3000);
    }, 12000);
  });

  // Keep script running until done
})();
