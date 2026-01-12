// src/stores/live-driver-store.js
// In-memory live driver location & meta store.
// Single-node, memory-backed. For multi-node production use Redis geospatial storage.

class LiveDriverStore {
  constructor() {
    // Map<driverId, { coordinates: [lng, lat], updatedAt: Date, isAvailable: boolean, meta: Object }>
    this.map = new Map();
  }

  /**
   * Set or update a driver's live info.
   * @param {String|ObjectId} driverId
   * @param {Object} param1
   * @param {Array<number>} param1.coordinates [lng, lat]
   * @param {Boolean} [param1.isAvailable=true]
   * @param {Object} [param1.meta={}]
   */
  set(driverId, { coordinates = null, isAvailable = true, meta = {} } = {}) {
    if (!driverId) return;
    const entry = {
      coordinates:
        Array.isArray(coordinates) && coordinates.length === 2
          ? coordinates.map(Number)
          : this.get(driverId)?.coordinates || null,
      updatedAt: new Date(),
      isAvailable: Boolean(isAvailable),
      meta: Object.assign({}, this.get(driverId)?.meta || {}, meta || {}),
    };
    this.map.set(String(driverId), entry);
  }

  /**
   * Get driver entry or null
   * @param {String|ObjectId} driverId
   */
  get(driverId) {
    if (!driverId) return null;
    return this.map.get(String(driverId)) || null;
  }

  /**
   * Remove driver from store
   * @param {String|ObjectId} driverId
   */
  remove(driverId) {
    if (!driverId) return;
    this.map.delete(String(driverId));
  }

  /**
   * Clear the entire store (useful for tests)
   */
  clear() {
    this.map.clear();
  }

  /**
   * Return array of all entries: { driverId, coordinates, updatedAt, isAvailable, meta }
   */
  all() {
    const out = [];
    for (const [driverId, value] of this.map.entries()) {
      out.push(Object.assign({ driverId }, value));
    }
    return out;
  }

  /**
   * getMeta(driverId) -> returns the meta object or null
   */
  getMeta(driverId) {
    const v = this.get(driverId);
    return v ? v.meta : null;
  }

  /**
   * setMeta(driverId, newMeta) -> merges existing meta with newMeta
   */
  setMeta(driverId, newMeta = {}) {
    if (!driverId) return;
    const existing = this.get(driverId) || {};
    this.set(driverId, {
      coordinates: existing.coordinates || null,
      isAvailable:
        existing.isAvailable !== undefined ? existing.isAvailable : true,
      meta: Object.assign({}, existing.meta || {}, newMeta || {}),
    });
  }

  /**
   * Find drivers within radiusMiles of centerCoords.
   * Options:
   *   - radiusMiles (default 30)
   *   - onlyAvailable (default true)
   *   - max (default 100)
   *   - haversineMiles: function([lng,lat], [lng,lat]) => miles   (required for distance calc)
   *
   * Returns array of { driverId, coordinates, updatedAt, isAvailable, meta, distanceMiles }
   */
  findWithinRadius(
    centerCoords,
    {
      radiusMiles = 30,
      onlyAvailable = true,
      max = 100,
      haversineMiles = null,
    } = {}
  ) {
    const results = [];
    if (!Array.isArray(centerCoords) || centerCoords.length !== 2)
      return results;

    for (const [driverId, value] of this.map.entries()) {
      if (onlyAvailable && !value.isAvailable) continue;
      const coords = value.coordinates;
      if (!coords || !Array.isArray(coords) || coords.length !== 2) continue;

      let distance = null;
      if (typeof haversineMiles === "function") {
        try {
          distance = haversineMiles(coords, centerCoords);
        } catch (e) {
          distance = null;
        }
      }

      // If distance couldn't be computed, skip entry
      if (distance === null || Number.isNaN(distance)) continue;

      if (distance <= Number(radiusMiles)) {
        results.push({
          driverId: String(driverId),
          coordinates: coords,
          updatedAt: value.updatedAt,
          isAvailable: value.isAvailable,
          meta: value.meta || {},
          distanceMiles: distance,
        });
      }
    }

    // sort by nearest
    results.sort((a, b) => a.distanceMiles - b.distanceMiles);

    return results.slice(0, Number(max));
  }
}

module.exports = new LiveDriverStore();
