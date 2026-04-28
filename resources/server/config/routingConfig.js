const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBoolean = (value, fallback = false) => {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const routingWeights = {
  alpha: toNumber(process.env.ROUTE_ALPHA, 0.55),
  beta: toNumber(process.env.ROUTE_BETA, 0.20),
  gamma: toNumber(process.env.ROUTE_GAMMA, 0.15),
  delta: toNumber(process.env.ROUTE_DELTA, 0.05),
  epsilon: toNumber(process.env.ROUTE_EPSILON, 0.05)
};

const routingConfig = {
  earthRadiusKm: toNumber(process.env.ROUTE_EARTH_RADIUS_KM, 6371),
  matrixProvider: (process.env.MATRIX_PROVIDER || 'haversine').toLowerCase(),
  matrixBaseUrl: process.env.MATRIX_BASE_URL || '',
  matrixAccessToken: process.env.MATRIX_ACCESS_TOKEN || '',
  matrixCacheTtlMs: toNumber(process.env.MATRIX_CACHE_TTL_MINUTES, 60) * 60 * 1000,
  matrixCacheMaxEntries: toNumber(process.env.MATRIX_CACHE_MAX_ENTRIES, 5000),
  geohashPrecision: toNumber(process.env.ROUTE_REGION_PRECISION, 100),
  reoptimizeOrderThreshold: toNumber(process.env.REOPTIMIZE_ORDER_THRESHOLD, 5),
  reoptimizeIntervalMinutes: toNumber(process.env.REOPTIMIZE_INTERVAL_MINUTES, 15),
  ortoolsEnabled: toBoolean(process.env.ORTOOLS_ENABLED, false),
  ortoolsTimeLimitSeconds: toNumber(process.env.ORTOOLS_TIME_LIMIT_SECONDS, 30),
  serviceTimeMinutes: toNumber(process.env.ROUTE_SERVICE_TIME_MINUTES, 0),
  slaPenaltyMultiplier: toNumber(process.env.ROUTE_SLA_PENALTY_MULTIPLIER, 1),
  defaultTravelSpeedKph: toNumber(process.env.ROUTE_DEFAULT_SPEED_KPH, 35)
};

module.exports = {
  routingConfig,
  routingWeights,
  toNumber,
  toBoolean
};
