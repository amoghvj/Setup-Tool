/**
 * @fileoverview
 * Matrix Cache Service
 *
 * Provides travel-time and distance matrix generation utilities
 * with optional external routing-provider integration and
 * lightweight in-memory caching.
 *
 * Responsibilities:
 * - Normalize heterogeneous stop inputs
 * - Compute directional travel metrics
 * - Integrate with external routing matrix providers
 * - Fallback to haversine-derived estimates
 * - Cache pairwise travel metrics
 *
 * Non-responsibilities:
 * - Persistent cache storage
 * - Traffic prediction
 * - Route optimization
 * - Geospatial indexing
 *
 * Runtime Assumptions:
 * - Node.js >= 18
 * - Native global fetch available
 *
 * Supported Matrix Providers:
 * - osrm
 * - graphhopper
 * - mapbox
 */

const { routingConfig } = require('../config/routingConfig');

const cache = new Map();

/**
 * ============================================
 * TYPE DEFINITIONS
 * ============================================
 */

/**
 * Routing configuration contract.
 *
 * @typedef {Object} RoutingConfig
 *
 * @property {number} earthRadiusKm
 * Radius of Earth used for haversine calculations.
 *
 * @property {number} geohashPrecision
 * Precision used for locality bucket generation.
 *
 * @property {number} matrixCacheTtlMs
 * Cache entry TTL in milliseconds.
 *
 * @property {number} matrixCacheMaxEntries
 * Maximum allowed cache entries before eviction.
 *
 * @property {number} defaultTravelSpeedKph
 * Fallback travel speed assumption used for haversine estimates.
 *
 * @property {string} matrixBaseUrl
 * Base URL for external routing providers.
 *
 * @property {'osrm'|'graphhopper'|'mapbox'} matrixProvider
 * Active external routing provider.
 *
 * @property {string|null} matrixAccessToken
 * Optional provider access token.
 */

/**
 * Canonical normalized stop representation.
 *
 * @typedef {Object} NormalizedStop
 *
 * @property {string} id
 * Stable stop identifier.
 *
 * @property {number} lat
 * Latitude coordinate.
 *
 * @property {number} lng
 * Longitude coordinate.
 *
 * @property {Object} raw
 * Original source stop object.
 */

/**
 * Supported stop input structure.
 *
 * @typedef {Object} StopInput
 *
 * @property {string} [id]
 * @property {ObjectId|string} [_id]
 * @property {number} [lat]
 * @property {number} [lng]
 * @property {{lat:number,lng:number}} [destination]
 * @property {{lat:number,lng:number}} [location]
 */

/**
 * Directional travel metrics.
 *
 * @typedef {Object} TravelMetrics
 *
 * @property {number} timeSeconds
 * Travel duration in seconds.
 *
 * @property {number} distanceKm
 * Travel distance in kilometers.
 *
 * @property {'haversine'|'osrm'|'graphhopper'|'mapbox'} source
 * Source used to derive metrics.
 */

/**
 * Matrix lookup contract.
 *
 * @typedef {Object} TravelMatrixResult
 *
 * @property {NormalizedStop[]} stops
 * Normalized stop list.
 *
 * @property {Map<string, TravelMetrics>} matrix
 * Directional pairwise metrics.
 *
 * @property {(fromId:string,toId:string)=>TravelMetrics|null} get
 * Retrieves directional metrics for a stop pair.
 */

/**
 * External provider matrix payload.
 *
 * @typedef {Object} RoadMatrixResponse
 *
 * @property {number[][]} times
 * Matrix of durations in seconds.
 *
 * @property {number[][]} distances
 * Matrix of distances in meters.
 */

/**
 * ============================================
 * CORE GEOSPATIAL HELPERS
 * ============================================
 */

/**
 * Converts degrees to radians.
 *
 * SYSTEM EFFECTS:
 * - None
 *
 * INVARIANTS PRESERVED:
 * - Deterministic numeric conversion
 *
 * TRANSACTION:
 * - No transactional behavior
 *
 * @private
 * @param {number} value
 *
 * @returns {number}
 * Radian representation of the provided degree value.
 */
function toRadians(value) {
  return (value * Math.PI) / 180;
}

/**
 * Computes haversine distance between two coordinates.
 *
 * Detailed Description:
 * Uses the haversine formula to estimate great-circle
 * distance between two latitude/longitude pairs.
 *
 * SYSTEM EFFECTS:
 * - None
 *
 * INVARIANTS PRESERVED:
 * - Distance always non-negative
 * - Deterministic output for identical inputs
 *
 * TRANSACTION:
 * - No transactional behavior
 *
 * @param {number} lat1
 * Origin latitude.
 *
 * @param {number} lng1
 * Origin longitude.
 *
 * @param {number} lat2
 * Destination latitude.
 *
 * @param {number} lng2
 * Destination longitude.
 *
 * @returns {number}
 * Distance in kilometers.
 *
 * @throws {Error}
 * Propagates unexpected numeric/runtime failures.
 *
 * @example
 * const km = haversineDistanceKm(
 *   12.9716,
 *   77.5946,
 *   13.0827,
 *   80.2707
 * );
 */
function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLng = toRadians(lng2 - lng1);
  const startLat = toRadians(lat1);
  const endLat = toRadians(lat2);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(startLat) *
    Math.cos(endLat) *
    Math.sin(deltaLng / 2) ** 2;

  return (
    2 *
    routingConfig.earthRadiusKm *
    Math.asin(Math.sqrt(a))
  );
}

/**
 * Builds a directional cache key for a stop pair.
 *
 * Detailed Description:
 * Generates an ordered directional identifier.
 * Forward and reverse paths intentionally produce
 * distinct keys.
 *
 * SYSTEM EFFECTS:
 * - None
 *
 * INVARIANTS PRESERVED:
 * - Key uniqueness for directional pairs
 *
 * TRANSACTION:
 * - No transactional behavior
 *
 * @private
 * @param {string} fromId
 * @param {string} toId
 *
 * @returns {string}
 * Directional cache key.
 */
function getPairKey(fromId, toId) {
  return `${fromId}::${toId}`;
}

/**
 * Generates a locality bucket identifier.
 *
 * Detailed Description:
 * Produces a precision-truncated coordinate bucket
 * intended for future locality grouping or clustering
 * optimizations.
 *
 * SYSTEM EFFECTS:
 * - None
 *
 * INVARIANTS PRESERVED:
 * - Stable bucket generation for identical inputs
 *
 * TRANSACTION:
 * - No transactional behavior
 *
 * @private
 * @param {{lat:number,lng:number}|null} stop
 *
 * @returns {string}
 * Locality bucket identifier.
 */
function getRegionBucket(stop) {
  if (!stop || stop.lat == null || stop.lng == null) {
    return 'unknown';
  }

  const precision = routingConfig.geohashPrecision || 100;
  const latBucket = Math.floor(stop.lat * precision) / precision;
  const lngBucket = Math.floor(stop.lng * precision) / precision;

  return `${latBucket}:${lngBucket}`;
}

/**
 * Normalizes heterogeneous stop inputs.
 *
 * Detailed Description:
 * Converts supported stop structures into a canonical
 * normalized form used internally throughout matrix
 * generation workflows.
 *
 * Supported Input Shapes:
 * - { id, lat, lng }
 * - { _id, lat, lng }
 * - { destination: { lat, lng } }
 * - { location: { lat, lng } }
 *
 * SYSTEM EFFECTS:
 * - None
 *
 * INVARIANTS PRESERVED:
 * - Canonical output structure
 * - Numeric coordinate normalization
 *
 * TRANSACTION:
 * - No transactional behavior
 *
 * @param {StopInput|null} stop
 * Raw stop input.
 *
 * @param {string} [fallbackId]
 * Fallback identifier used when no explicit ID exists.
 *
 * @returns {NormalizedStop|null}
 * Canonical normalized stop or null if invalid.
 *
 * @throws {Error}
 * Propagates unexpected runtime failures.
 *
 * @example
 * const stop = normalizeStop({
 *   destination: {
 *     lat: 12.9,
 *     lng: 77.5
 *   }
 * });
 */
function normalizeStop(stop, fallbackId) {
  if (!stop) {
    return null;
  }

  const id =
    stop._virtualId ||
    stop.id ||
    stop._id?.toString?.() ||
    stop.toString?.() ||
    fallbackId;

  const lat =
    stop.lat ??
    stop.destination?.lat ??
    stop.location?.lat;

  const lng =
    stop.lng ??
    stop.destination?.lng ??
    stop.location?.lng;

  if (id == null || lat == null || lng == null) {
    return null;
  }

  return {
    id: String(id),
    lat: Number(lat),
    lng: Number(lng),

    /**
     * Internal-only metadata.
     * Consumers must not rely on this field.
     */
    regionBucket: getRegionBucket({
      lat: Number(lat),
      lng: Number(lng)
    }),

    raw: stop
  };
}

/**
 * Inserts a cache entry with lightweight LRU refresh semantics.
 *
 * Detailed Description:
 * Cache eviction intentionally approximates FIFO/LRU behavior
 * using insertion-ordered Map semantics and recency refresh
 * during reads.
 *
 * SYSTEM EFFECTS:
 * - Mutates in-memory cache
 * - May evict oldest cache entries
 *
 * INVARIANTS PRESERVED:
 * - Cache size bounded by matrixCacheMaxEntries
 * - Entry TTL metadata maintained
 *
 * TRANSACTION:
 * - No transactional behavior
 *
 * @private
 * @param {string} pairKey
 * @param {TravelMetrics} value
 */
function cacheEntry(pairKey, value) {
  cache.set(pairKey, {
    value,
    expiresAt:
      Date.now() +
      routingConfig.matrixCacheTtlMs
  });

  while (
    cache.size >
    routingConfig.matrixCacheMaxEntries
  ) {
    const firstKey =
      cache.keys().next().value;

    cache.delete(firstKey);
  }
}

/**
 * Retrieves a cached matrix entry.
 *
 * Detailed Description:
 * Performs TTL validation and refreshes insertion order
 * to approximate lightweight LRU behavior.
 *
 * SYSTEM EFFECTS:
 * - May remove expired entries
 * - Refreshes cache recency ordering
 *
 * INVARIANTS PRESERVED:
 * - Expired entries never returned
 * - Cache ordering remains insertion-based
 *
 * TRANSACTION:
 * - No transactional behavior
 *
 * @private
 * @param {string} pairKey
 *
 * @returns {TravelMetrics|null}
 * Cached travel metrics or null if unavailable.
 */
function getCachedEntry(pairKey) {
  const entry = cache.get(pairKey);

  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    cache.delete(pairKey);
    return null;
  }

  cache.delete(pairKey);
  cache.set(pairKey, entry);

  return entry.value;
}

/**
 * Derives fallback travel metrics using haversine estimation.
 *
 * Detailed Description:
 * Computes directional travel duration and distance
 * using straight-line haversine distance combined
 * with configured average travel speed assumptions.
 *
 * SYSTEM EFFECTS:
 * - None
 *
 * INVARIANTS PRESERVED:
 * - timeSeconds always >= 1
 * - distanceKm always non-negative
 * - Output contract remains provider-independent
 *
 * TRANSACTION:
 * - No transactional behavior
 *
 * @param {NormalizedStop} fromStop
 * Origin stop.
 *
 * @param {NormalizedStop} toStop
 * Destination stop.
 *
 * @returns {TravelMetrics}
 * Derived fallback travel metrics.
 *
 * @throws {Error}
 * Propagates unexpected numeric/runtime failures.
 *
 * @example
 * const metrics = deriveHaversineMetrics(
 *   fromStop,
 *   toStop
 * );
 */
function deriveHaversineMetrics(fromStop, toStop) {
  const distanceKm =
    haversineDistanceKm(
      fromStop.lat,
      fromStop.lng,
      toStop.lat,
      toStop.lng
    );

  const travelMinutes =
    (distanceKm /
      routingConfig.defaultTravelSpeedKph) *
    60;

  return {
    timeSeconds: Math.max(
      1,
      Math.round(travelMinutes * 60)
    ),

    distanceKm,

    source: 'haversine'
  };
}

/**
 * ============================================
 * EXTERNAL PROVIDER INTEGRATION
 * ============================================
 */

/**
 * Retrieves matrix data from OSRM.
 *
 * SYSTEM EFFECTS:
 * - Performs outbound HTTP request
 *
 * INVARIANTS PRESERVED:
 * - Durations normalized to seconds
 * - Distances normalized to meters
 *
 * TRANSACTION:
 * - No transactional behavior
 *
 * @private
 * @async
 * @param {NormalizedStop[]} stops
 *
 * @returns {Promise<RoadMatrixResponse|null>}
 * Provider matrix response or null if disabled.
 *
 * @throws {Error}
 * OSRM request failure.
 */
async function fetchOsrmMatrix(stops) {
  if (!routingConfig.matrixBaseUrl) {
    return null;
  }

  const coordinates = stops
    .map(stop => `${stop.lng},${stop.lat}`)
    .join(';');

  const url =
    `${routingConfig.matrixBaseUrl.replace(/\/$/, '')}` +
    `/table/v1/driving/${coordinates}` +
    `?annotations=duration,distance` +
    `&sources=all&destinations=all`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `OSRM matrix request failed with ${response.status}`
    );
  }

  const payload = await response.json();

  return {
    times:
      payload.durations ||
      payload.times ||
      [],

    distances:
      payload.distances || []
  };
}

/**
 * Retrieves matrix data from GraphHopper.
 *
 * SYSTEM EFFECTS:
 * - Performs outbound HTTP request
 *
 * INVARIANTS PRESERVED:
 * - Durations normalized to seconds
 * - Distances normalized to meters
 *
 * TRANSACTION:
 * - No transactional behavior
 *
 * @private
 * @async
 * @param {NormalizedStop[]} stops
 *
 * @returns {Promise<RoadMatrixResponse|null>}
 *
 * @throws {Error}
 * GraphHopper request failure.
 */
async function fetchGraphHopperMatrix(stops) {
  if (!routingConfig.matrixBaseUrl) {
    return null;
  }

  const url =
    `${routingConfig.matrixBaseUrl.replace(/\/$/, '')}` +
    `/matrix?profile=car`;

  const body = {
    points: stops.map(stop => [
      stop.lng,
      stop.lat
    ]),

    out_arrays: [
      'times',
      'distances'
    ]
  };

  const response = await fetch(url, {
    method: 'POST',

    headers: {
      'Content-Type': 'application/json'
    },

    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(
      `GraphHopper matrix request failed with ${response.status}`
    );
  }

  const payload = await response.json();

  return {
    times:
      payload.times ||
      payload.weights ||
      [],

    distances:
      payload.distances || []
  };
}

/**
 * Retrieves matrix data from Mapbox.
 *
 * SYSTEM EFFECTS:
 * - Performs outbound HTTP request
 *
 * INVARIANTS PRESERVED:
 * - Durations normalized to seconds
 * - Distances normalized to meters
 *
 * TRANSACTION:
 * - No transactional behavior
 *
 * @private
 * @async
 * @param {NormalizedStop[]} stops
 *
 * @returns {Promise<RoadMatrixResponse|null>}
 *
 * @throws {Error}
 * Mapbox request failure.
 */
async function fetchMapboxMatrix(stops) {
  if (
    !routingConfig.matrixBaseUrl ||
    !routingConfig.matrixAccessToken
  ) {
    return null;
  }

  const coordinates = stops
    .map(stop => `${stop.lng},${stop.lat}`)
    .join(';');

  const url =
    `${routingConfig.matrixBaseUrl.replace(/\/$/, '')}` +
    `/directions-matrix/v1/mapbox/driving/${coordinates}` +
    `?annotations=duration,distance` +
    `&access_token=${routingConfig.matrixAccessToken}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Mapbox matrix request failed with ${response.status}`
    );
  }

  const payload = await response.json();

  return {
    times:
      payload.durations || [],

    distances:
      payload.distances || []
  };
}

/**
 * Resolves external provider matrix data.
 *
 * Detailed Description:
 * Dispatches provider-specific matrix retrieval based
 * on configured provider type.
 *
 * Failure Behavior:
 * - Provider failures intentionally degrade gracefully
 * - Complete failures return null
 * - Downstream logic falls back to haversine estimates
 *
 * SYSTEM EFFECTS:
 * - Performs outbound HTTP requests
 *
 * INVARIANTS PRESERVED:
 * - Unsupported providers never throw
 * - Single-stop matrices short-circuit
 *
 * TRANSACTION:
 * - No transactional behavior
 *
 * @private
 * @async
 * @param {NormalizedStop[]} stops
 *
 * @returns {Promise<RoadMatrixResponse|null>}
 *
 * @throws {Error}
 * Unexpected runtime failures outside guarded provider calls.
 */
async function fetchRoadMatrix(stops) {
  if (stops.length <= 1) {
    return null;
  }

  try {
    if (
      routingConfig.matrixProvider === 'osrm'
    ) {
      return await fetchOsrmMatrix(stops);
    }

    if (
      routingConfig.matrixProvider === 'graphhopper'
    ) {
      return await fetchGraphHopperMatrix(stops);
    }

    if (
      routingConfig.matrixProvider === 'mapbox'
    ) {
      return await fetchMapboxMatrix(stops);
    }
  } catch (_error) {
    return null;
  }

  return null;
}

/**
 * Builds directional matrix entries from provider data.
 *
 * Detailed Description:
 * Converts provider-native matrix payloads into
 * normalized internal directional metrics.
 *
 * Partial Failure Behavior:
 * - Missing edge metrics fallback individually
 *   to haversine-derived estimates
 *
 * SYSTEM EFFECTS:
 * - Mutates in-memory cache
 *
 * INVARIANTS PRESERVED:
 * - Fully connected directional matrix
 * - All non-self pairs represented
 * - Internal time unit always seconds
 * - Internal distance unit always kilometers
 *
 * TRANSACTION:
 * - No transactional behavior
 *
 * @private
 * @param {NormalizedStop[]} stops
 * @param {RoadMatrixResponse|null} roadMatrix
 *
 * @returns {Map<string, TravelMetrics>}
 * Directional travel matrix.
 */
function fillMatrixFromRoadData(
  stops,
  roadMatrix
) {
  const pairMatrix = new Map();

  for (let i = 0; i < stops.length; i += 1) {
    for (let j = 0; j < stops.length; j += 1) {
      if (i === j) {
        continue;
      }

      const fromStop = stops[i];
      const toStop = stops[j];

      const timeSeconds =
        roadMatrix?.times?.[i]?.[j];

      const distanceMeters =
        roadMatrix?.distances?.[i]?.[j];

      const fallback =
        deriveHaversineMetrics(
          fromStop,
          toStop
        );

      const entry = {
        timeSeconds:
          Number.isFinite(timeSeconds)
            ? Number(timeSeconds)
            : fallback.timeSeconds,

        distanceKm:
          Number.isFinite(distanceMeters)
            ? Number(distanceMeters) / 1000
            : fallback.distanceKm,

        source: roadMatrix
          ? routingConfig.matrixProvider
          : 'haversine'
      };

      pairMatrix.set(
        getPairKey(
          fromStop.id,
          toStop.id
        ),
        entry
      );

      cacheEntry(
        getPairKey(
          fromStop.id,
          toStop.id
        ),
        entry
      );
    }
  }

  return pairMatrix;
}

/**
 * Builds a fully connected directional travel matrix.
 *
 * Detailed Description:
 * Generates pairwise directional travel metrics between
 * all non-self stop combinations using either:
 * - External routing providers
 * - Haversine-derived fallback estimation
 *
 * Directional Guarantees:
 * - Matrix is fully connected
 * - All non-self pairs exist
 * - Symmetry is NOT guaranteed
 * - Forward/reverse entries may differ
 *
 * SYSTEM EFFECTS:
 * - Performs outbound provider requests
 * - Mutates in-memory cache
 *
 * INVARIANTS PRESERVED:
 * - Directional matrix completeness
 * - Canonical stop normalization
 * - Stable internal units
 *
 * TRANSACTION:
 * - No transactional behavior
 *
 * @async
 * @param {StopInput[]} stops
 * Raw stop inputs.
 *
 * @param {{skipRoadMatrix?:boolean}} [options]
 * Matrix generation options.
 *
 * @returns {Promise<TravelMatrixResult>}
 * Fully connected directional matrix result.
 *
 * @throws {Error}
 * Unexpected runtime failures.
 *
 * @example
 * const matrix = await buildTravelMatrix(
 *   deliveries
 * );
 */
async function buildTravelMatrix(
  stops,
  options = {}
) {
  const normalizedStops = stops
    .map((stop, index) =>
      normalizeStop(
        stop,
        `stop-${index}`
      )
    )
    .filter(Boolean);

  const pairMatrix = new Map();

  if (normalizedStops.length <= 1) {
    return {
      stops: normalizedStops,

      matrix: pairMatrix,

      get(fromId, toId) {
        return (
          pairMatrix.get(
            getPairKey(fromId, toId)
          ) || null
        );
      }
    };
  }

  const roadMatrix =
    options.skipRoadMatrix
      ? null
      : await fetchRoadMatrix(
        normalizedStops
      );

  if (roadMatrix) {
    const matrix =
      fillMatrixFromRoadData(
        normalizedStops,
        roadMatrix
      );

    return {
      stops: normalizedStops,

      matrix,

      get(fromId, toId) {
        return (
          matrix.get(
            getPairKey(fromId, toId)
          ) || null
        );
      }
    };
  }

  for (
    let i = 0;
    i < normalizedStops.length;
    i += 1
  ) {
    for (
      let j = 0;
      j < normalizedStops.length;
      j += 1
    ) {
      if (i === j) {
        continue;
      }

      const fromStop =
        normalizedStops[i];

      const toStop =
        normalizedStops[j];

      const entry =
        deriveHaversineMetrics(
          fromStop,
          toStop
        );

      pairMatrix.set(
        getPairKey(
          fromStop.id,
          toStop.id
        ),
        entry
      );

      cacheEntry(
        getPairKey(
          fromStop.id,
          toStop.id
        ),
        entry
      );
    }
  }

  return {
    stops: normalizedStops,

    matrix: pairMatrix,

    get(fromId, toId) {
      return (
        pairMatrix.get(
          getPairKey(fromId, toId)
        ) || null
      );
    }
  };
}

/**
 * Retrieves cached travel metrics for a stop pair.
 *
 * Detailed Description:
 * Read-only cache lookup helper that resolves
 * normalized directional pair keys and returns
 * existing cached metrics when available.
 *
 * Important:
 * - Does NOT compute fallback metrics
 * - Does NOT generate new cache entries
 * - Only retrieves existing cache state
 *
 * SYSTEM EFFECTS:
 * - Refreshes cache recency ordering
 * - May remove expired entries
 *
 * INVARIANTS PRESERVED:
 * - No matrix recomputation
 * - Directional cache semantics preserved
 *
 * TRANSACTION:
 * - No transactional behavior
 *
 * @param {StopInput} fromStop
 * Origin stop.
 *
 * @param {StopInput} toStop
 * Destination stop.
 *
 * @returns {TravelMetrics|null}
 * Cached metrics or null if unavailable.
 *
 * @throws {Error}
 * Unexpected normalization/runtime failures.
 *
 * @example
 * const cached =
 *   getCachedTravelMetrics(
 *     fromStop,
 *     toStop
 *   );
 */
function getCachedTravelMetrics(
  fromStop,
  toStop
) {
  const from = normalizeStop(fromStop);
  const to = normalizeStop(toStop);

  if (!from || !to) {
    return null;
  }

  return getCachedEntry(
    getPairKey(from.id, to.id)
  );
}

module.exports = {
  buildTravelMatrix,
  getCachedTravelMetrics,
  haversineDistanceKm,
  normalizeStop,
  deriveHaversineMetrics,
  getPairKey
};
