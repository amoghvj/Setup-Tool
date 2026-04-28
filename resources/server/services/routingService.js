const PickupLocation = require('../models/PickupLocation');
const DeliveryAssignment = require('../models/DeliveryAssignment');
const { routingWeights, routingConfig } = require('../config/routingConfig');
const {
  buildTravelMatrix,
  getCachedTravelMetrics,
  normalizeStop,
  deriveHaversineMetrics
} = require('./matrixCacheService');

function getMatrixEntry(matrix, fromId, toId) {
  if (!matrix) {
    return null;
  }

  if (typeof matrix.get === 'function') {
    return matrix.get(fromId, toId) || matrix.get(`${fromId}::${toId}`) || null;
  }

  if (matrix instanceof Map) {
    return matrix.get(`${fromId}::${toId}`) || null;
  }

  return matrix?.[fromId]?.[toId] || null;
}

function resolveStopId(stop, fallbackId) {
  if (!stop) {
    return String(fallbackId);
  }

  return String(stop._virtualId || stop.id || stop._id || stop._id?.toString?.() || fallbackId);
}

function resolveStopCoordinates(stop) {
  if (!stop) {
    return null;
  }

  const lat = stop.lat ?? stop.destination?.lat ?? stop.location?.lat;
  const lng = stop.lng ?? stop.destination?.lng ?? stop.location?.lng;

  if (lat == null || lng == null) {
    return null;
  }

  return { lat: Number(lat), lng: Number(lng) };
}

function normalizeRouteStop(stop, fallbackId) {
  const coords = resolveStopCoordinates(stop);
  if (!coords) {
    return null;
  }

  const id = resolveStopId(stop, fallbackId);
  return {
    id,
    lat: coords.lat,
    lng: coords.lng,
    raw: stop,
    serviceTimeMinutes: Number(stop?.serviceTimeMinutes ?? stop?.serviceTime ?? routingConfig.serviceTimeMinutes ?? 0),
    slaMinutes: stop?.slaMinutes ?? stop?.dueInMinutes ?? null
  };
}

async function resolveRouteNodes(nodes) {
  const unresolvedIds = [];
  const resolvedNodes = nodes.map((node, index) => {
    const coords = resolveStopCoordinates(node);
    if (coords) {
      return node;
    }

    const id = resolveStopId(node, `node-${index}`);
    unresolvedIds.push(id);
    return { _lookupId: id };
  });

  if (unresolvedIds.length === 0) {
    return resolvedNodes;
  }

  const docs = await DeliveryAssignment.find({ _id: { $in: unresolvedIds } });
  const docMap = new Map(docs.map(doc => [doc._id.toString(), doc]));

  return resolvedNodes.map((node, index) => {
    if (!node._lookupId) {
      return node;
    }

    const doc = docMap.get(node._lookupId);
    return doc || nodes[index];
  });
}

function getLegMetrics(fromStop, toStop, matrix) {
  const from = normalizeStop(fromStop);
  const to = normalizeStop(toStop);

  if (!from || !to) {
    return { timeMinutes: 0, distanceKm: 0, source: 'fallback' };
  }

  const matrixEntry = getMatrixEntry(matrix, from.id, to.id);
  if (matrixEntry) {
    return {
      timeMinutes: Number(matrixEntry.timeSeconds ?? 0) / 60,
      distanceKm: Number(matrixEntry.distanceKm ?? 0),
      source: matrixEntry.source || 'matrix'
    };
  }

  const cached = getCachedTravelMetrics(from, to);
  if (cached) {
    return {
      timeMinutes: Number(cached.timeSeconds ?? 0) / 60,
      distanceKm: Number(cached.distanceKm ?? 0),
      source: cached.source || 'cache'
    };
  }

  const fallback = deriveHaversineMetrics(from, to);
  return {
    timeMinutes: fallback.timeSeconds / 60,
    distanceKm: fallback.distanceKm,
    source: fallback.source
  };
}

function computeLatePenalty(route, matrix, options = {}) {
  let elapsedMinutes = Number(options.startTimeMinutes ?? 0);
  let penalty = 0;

  for (let index = 0; index < route.length - 1; index += 1) {
    const leg = getLegMetrics(route[index], route[index + 1], matrix);
    elapsedMinutes += leg.timeMinutes;

    const stop = route[index + 1];
    const stopSla = Number(stop?.slaMinutes ?? stop?.dueInMinutes ?? NaN);
    if (Number.isFinite(stopSla) && elapsedMinutes > stopSla) {
      penalty += (elapsedMinutes - stopSla) * routingConfig.slaPenaltyMultiplier;
    }

    elapsedMinutes += Number(stop?.serviceTimeMinutes ?? stop?.serviceTime ?? routingConfig.serviceTimeMinutes ?? 0);
  }

  return penalty;
}

function routeCost(route, matrix, options = {}) {
  const normalizedRoute = route
    .map((stop, index) => normalizeRouteStop(stop, `route-${index}`))
    .filter(Boolean);

  if (normalizedRoute.length <= 1) {
    return 0;
  }

  let travelMinutes = 0;
  let distanceKm = 0;

  for (let index = 0; index < normalizedRoute.length - 1; index += 1) {
    const leg = getLegMetrics(normalizedRoute[index], normalizedRoute[index + 1], matrix);
    travelMinutes += leg.timeMinutes;
    distanceKm += leg.distanceKm;
  }

  const latePenalty = computeLatePenalty(normalizedRoute, matrix, options);
  const loadPenalty = Number(options.loadPenalty ?? Math.max(0, normalizedRoute.length - 1));
  const detourPenalty = Number(options.detourPenalty ?? 0);

  return (
    routingWeights.alpha * travelMinutes +
    routingWeights.beta * distanceKm +
    routingWeights.gamma * latePenalty +
    routingWeights.delta * loadPenalty +
    routingWeights.epsilon * detourPenalty
  );
}

function insertAt(route, stop, position) {
  const nextRoute = route.slice();
  nextRoute.splice(position, 0, stop);
  return nextRoute;
}

function routeCostForInsertion(route, stop, position, matrix, options = {}) {
  return routeCost(insertAt(route, stop, position), matrix, options);
}

function buildRoute(stops, matrix, options = {}) {
  const normalizedStops = stops
    .map((stop, index) => normalizeRouteStop(stop, `stop-${index}`))
    .filter(Boolean);

  if (normalizedStops.length <= 1) {
    return normalizedStops.map(stop => stop.raw);
  }

  let route = [normalizedStops[0]];
  const unvisited = normalizedStops.slice(1);

  while (unvisited.length > 0) {
    let bestStopIndex = 0;
    let bestPosition = 1;
    let bestCost = Infinity;

    for (let stopIndex = 0; stopIndex < unvisited.length; stopIndex += 1) {
      const stop = unvisited[stopIndex];

      for (let position = 1; position <= route.length; position += 1) {
        const candidateCost = routeCostForInsertion(route, stop, position, matrix, options);
        if (candidateCost < bestCost) {
          bestCost = candidateCost;
          bestStopIndex = stopIndex;
          bestPosition = position;
        }
      }
    }

    route = insertAt(route, unvisited[bestStopIndex], bestPosition);
    unvisited.splice(bestStopIndex, 1);
  }

  return route.map(stop => stop.raw);
}

function twoOptSwap(route, startIndex, endIndex) {
  return [
    ...route.slice(0, startIndex),
    ...route.slice(startIndex, endIndex + 1).reverse(),
    ...route.slice(endIndex + 1)
  ];
}

function twoOpt(route, matrix, options = {}) {
  if (route.length <= 3) {
    return route.slice();
  }

  let improved = true;
  let bestRoute = route.slice();
  let bestCost = routeCost(bestRoute, matrix, options);

  while (improved) {
    improved = false;

    for (let i = 1; i < bestRoute.length - 1; i += 1) {
      for (let j = i + 1; j < bestRoute.length; j += 1) {
        const candidate = twoOptSwap(bestRoute, i, j);
        const candidateCost = routeCost(candidate, matrix, options);

        if (candidateCost + 1e-9 < bestCost) {
          bestRoute = candidate;
          bestCost = candidateCost;
          improved = true;
          break;
        }
      }

      if (improved) {
        break;
      }
    }
  }

  return bestRoute;
}

async function calculateRoute(nodes, options = {}) {
  if (!Array.isArray(nodes) || nodes.length <= 1) {
    return Array.isArray(nodes) ? [...nodes] : [];
  }

  const resolvedNodes = await resolveRouteNodes(nodes);
  const matrixContext = await buildTravelMatrix(resolvedNodes, options);
  const insertionRoute = buildRoute(resolvedNodes, matrixContext, options);
  return twoOpt(insertionRoute, matrixContext, options);
}

async function getNextPickupLocation(activeDeliveries, currentLocation) {
  let referencePoint = null;

  if (Array.isArray(activeDeliveries) && activeDeliveries.length > 0) {
    const last = activeDeliveries[activeDeliveries.length - 1];
    referencePoint = last?.destination || last?.location || last;
  } else {
    referencePoint = currentLocation;
  }

  const ref = normalizeStop(referencePoint, 'reference');
  if (!ref) {
    return null;
  }

  const allPickups = await PickupLocation.find({});
  if (allPickups.length === 0) {
    return null;
  }

  let nearestPickup = null;
  let bestScore = Infinity;

  for (const pickup of allPickups) {
    const pickupStop = normalizeStop({
      id: pickup.pickupId,
      lat: pickup.location.lat,
      lng: pickup.location.lng
    });

    const travelMetrics = getCachedTravelMetrics(ref, pickupStop) || deriveHaversineMetrics(ref, pickupStop);
    const score = travelMetrics.timeSeconds + travelMetrics.distanceKm;

    if (score < bestScore) {
      bestScore = score;
      nearestPickup = pickup;
    }
  }

  return nearestPickup ? { lat: nearestPickup.location.lat, lng: nearestPickup.location.lng } : null;
}

module.exports = {
  routeCost,
  buildRoute,
  twoOpt,
  twoOptSwap,
  calculateRoute,
  getNextPickupLocation,
  getLegMetrics,
  resolveRouteNodes
};
