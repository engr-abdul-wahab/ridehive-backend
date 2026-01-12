// live-user-store.js
// Stores users listening for nearby drivers

// internal Map
const liveUserMap = new Map();

/**
 * Add/update user subscription
 * @param {string} userId
 * @param {Object} data - { socketId, coords: [lat, lng], radiusMiles }
 */
function set(userId, data) {
  liveUserMap.set(userId, data);
}

/**
 * Remove user subscription
 */
function remove(userId) {
  liveUserMap.delete(userId);
}

/**
 * Find users within radius of driver coordinates
 */
function findUsersNearDriver(driverCoords) {
  const nearbyUsers = [];
  for (const [
    userId,
    { coords, radiusMiles, socketId },
  ] of liveUserMap.entries()) {
    const distance = haversineMiles(coords, driverCoords);
    if (distance <= radiusMiles) nearbyUsers.push({ userId, socketId });
  }
  return nearbyUsers;
}

// Simple haversine function (distance in miles)
function haversineMiles([lat1, lon1], [lat2, lon2]) {
  const R = 3958.8; // Radius of Earth in miles
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

module.exports = {
  map: liveUserMap,
  set,
  remove,
  findUsersNearDriver,
  haversineMiles,
};
