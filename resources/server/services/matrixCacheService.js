const { routingConfig } = require('../config/routingConfig');

const cache = new Map();

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLng = toRadians(lng2 - lng1);
  const startLat = toRadians(lat1);
  const endLat = toRadians(lat2);

  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) ** 2;
  return 2 * routingConfig.earthRadiusKm * Math.asin(Math.sqrt(a));
}

function getPairKey(fromId, toId) {
  return `${fromId}::${toId}`;
}

function getRegionBucket(stop) {
  if (!stop || stop.lat == null || stop.lng == null) {
    return 'unknown';
  }

  const precision = routingConfig.geohashPrecision || 100;
  const latBucket = Math.floor(stop.lat * precision) / precision;
  const lngBucket = Math.floor(stop.lng * precision) / precision;
  return `${latBucket}:${lngBucket}`;
}

function normalizeStop(stop, fallbackId) {
  if (!stop) {
    return null;
  }

  const id = stop._virtualId || stop.id || stop._id?.toString?.() || stop.toString?.() || fallbackId;
  const lat = stop.lat ?? stop.destination?.lat ?? stop.location?.lat;
  const lng = stop.lng ?? stop.destination?.lng ?? stop.location?.lng;

  if (id == null || lat == null || lng == null) {
    return null;
  }

  return {
    id: String(id),
    lat: Number(lat),
    lng: Number(lng),
    regionBucket: getRegionBucket({ lat: Number(lat), lng: Number(lng) }),
    raw: stop
  };
}

function cacheEntry(pairKey, value) {
  cache.set(pairKey, {
    value,
    expiresAt: Date.now() + routingConfig.matrixCacheTtlMs
  });

  while (cache.size > routingConfig.matrixCacheMaxEntries) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
}

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

function deriveHaversineMetrics(fromStop, toStop) {
  const distanceKm = haversineDistanceKm(fromStop.lat, fromStop.lng, toStop.lat, toStop.lng);
  const travelMinutes = (distanceKm / routingConfig.defaultTravelSpeedKph) * 60;
  return {
    timeSeconds: Math.max(1, Math.round(travelMinutes * 60)),
    distanceKm,
    source: 'haversine'
  };
}

async function fetchOsrmMatrix(stops) {
  if (!routingConfig.matrixBaseUrl) {
    return null;
  }

  const coordinates = stops.map(stop => `${stop.lng},${stop.lat}`).join(';');
  const url = `${routingConfig.matrixBaseUrl.replace(/\/$/, '')}/table/v1/driving/${coordinates}?annotations=duration,distance&sources=all&destinations=all`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OSRM matrix request failed with ${response.status}`);
  }

  const payload = await response.json();
  return {
    times: payload.durations || payload.times || [],
    distances: payload.distances || []
  };
}

async function fetchGraphHopperMatrix(stops) {
  if (!routingConfig.matrixBaseUrl) {
    return null;
  }

  const url = `${routingConfig.matrixBaseUrl.replace(/\/$/, '')}/matrix?profile=car`;
  const body = {
    points: stops.map(stop => [stop.lng, stop.lat]),
    out_arrays: ['times', 'distances']
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`GraphHopper matrix request failed with ${response.status}`);
  }

  const payload = await response.json();
  return {
    times: payload.times || payload.weights || [],
    distances: payload.distances || []
  };
}

async function fetchMapboxMatrix(stops) {
  if (!routingConfig.matrixBaseUrl || !routingConfig.matrixAccessToken) {
    return null;
  }

  const coordinates = stops.map(stop => `${stop.lng},${stop.lat}`).join(';');
  const url = `${routingConfig.matrixBaseUrl.replace(/\/$/, '')}/directions-matrix/v1/mapbox/driving/${coordinates}?annotations=duration,distance&access_token=${routingConfig.matrixAccessToken}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Mapbox matrix request failed with ${response.status}`);
  }

  const payload = await response.json();
  return {
    times: payload.durations || [],
    distances: payload.distances || []
  };
}

async function fetchRoadMatrix(stops) {
  if (stops.length <= 1) {
    return null;
  }

  try {
    if (routingConfig.matrixProvider === 'osrm') {
      return await fetchOsrmMatrix(stops);
    }

    if (routingConfig.matrixProvider === 'graphhopper') {
      return await fetchGraphHopperMatrix(stops);
    }

    if (routingConfig.matrixProvider === 'mapbox') {
      return await fetchMapboxMatrix(stops);
    }
  } catch (_error) {
    return null;
  }

  return null;
}

function fillMatrixFromRoadData(stops, roadMatrix) {
  const pairMatrix = new Map();

  for (let i = 0; i < stops.length; i += 1) {
    for (let j = 0; j < stops.length; j += 1) {
      if (i === j) {
        continue;
      }

      const fromStop = stops[i];
      const toStop = stops[j];
      const timeSeconds = roadMatrix?.times?.[i]?.[j];
      const distanceMeters = roadMatrix?.distances?.[i]?.[j];

      const fallback = deriveHaversineMetrics(fromStop, toStop);
      const entry = {
        timeSeconds: Number.isFinite(timeSeconds) ? Number(timeSeconds) : fallback.timeSeconds,
        distanceKm: Number.isFinite(distanceMeters) ? Number(distanceMeters) / 1000 : fallback.distanceKm,
        source: roadMatrix ? routingConfig.matrixProvider : 'haversine'
      };

      pairMatrix.set(getPairKey(fromStop.id, toStop.id), entry);
      cacheEntry(getPairKey(fromStop.id, toStop.id), entry);
    }
  }

  return pairMatrix;
}

async function buildTravelMatrix(stops, options = {}) {
  const normalizedStops = stops
    .map((stop, index) => normalizeStop(stop, `stop-${index}`))
    .filter(Boolean);

  const pairMatrix = new Map();

  if (normalizedStops.length <= 1) {
    return {
      stops: normalizedStops,
      matrix: pairMatrix,
      get(fromId, toId) {
        return pairMatrix.get(getPairKey(fromId, toId)) || null;
      }
    };
  }

  const roadMatrix = options.skipRoadMatrix ? null : await fetchRoadMatrix(normalizedStops);

  if (roadMatrix) {
    const matrix = fillMatrixFromRoadData(normalizedStops, roadMatrix);
    return {
      stops: normalizedStops,
      matrix,
      get(fromId, toId) {
        return matrix.get(getPairKey(fromId, toId)) || null;
      }
    };
  }

  for (let i = 0; i < normalizedStops.length; i += 1) {
    for (let j = 0; j < normalizedStops.length; j += 1) {
      if (i === j) {
        continue;
      }

      const fromStop = normalizedStops[i];
      const toStop = normalizedStops[j];
      const entry = deriveHaversineMetrics(fromStop, toStop);
      pairMatrix.set(getPairKey(fromStop.id, toStop.id), entry);
      cacheEntry(getPairKey(fromStop.id, toStop.id), entry);
    }
  }

  return {
    stops: normalizedStops,
    matrix: pairMatrix,
    get(fromId, toId) {
      return pairMatrix.get(getPairKey(fromId, toId)) || null;
    }
  };
}

function getCachedTravelMetrics(fromStop, toStop) {
  const from = normalizeStop(fromStop);
  const to = normalizeStop(toStop);
  if (!from || !to) {
    return null;
  }

  return getCachedEntry(getPairKey(from.id, to.id));
}

module.exports = {
  buildTravelMatrix,
  getCachedTravelMetrics,
  haversineDistanceKm,
  normalizeStop,
  deriveHaversineMetrics,
  getPairKey
};
