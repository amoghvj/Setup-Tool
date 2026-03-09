const PickupLocation = require('../models/PickupLocation');
const DeliveryAssignment = require('../models/DeliveryAssignment');

// ─── Cost Function ───────────────────────────────────────────────────────────
// Cartesian distance between two geographic points.
// Swappable in the future for ML-based travel-time prediction,
// road-network distance APIs, or traffic-aware routing services.

/**
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 * @returns {number} Euclidean distance
 */
function cost(lat1, lng1, lat2, lng2) {
  return Math.sqrt((lat2 - lat1) ** 2 + (lng2 - lng1) ** 2);
}

// ─── Permutation Generator ───────────────────────────────────────────────────
// Yields all permutations of an array.
// Only used on arrays of size ≤ 9 (max 362,880 permutations).

/**
 * @param {Array} arr
 * @yields {Array}
 */
function* permutations(arr) {
  if (arr.length <= 1) {
    yield arr;
    return;
  }
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const perm of permutations(rest)) {
      yield [arr[i], ...perm];
    }
  }
}

// ─── Route Calculation (Brute-Force TSP) ─────────────────────────────────────
//
// Constraint: The FIRST element in the input list is fixed and never permuted.
// Only the remaining elements are rearranged to minimise total travel cost.
//
// Input:  Array of nodes. Each node is either:
//         - A MongoDB ObjectId (resolved to coordinates via DeliveryAssignment)
//         - An object with { _virtualId, lat, lng } (injected by the caller
//           for the cancellation edge case)
//
// Output: The same array of IDs/objects in optimal order (first element unchanged).

/**
 * @param {Array} nodes - Ordered array of delivery ObjectIds or virtual location objects.
 * @returns {Promise<Array>} Optimally ordered array (same elements, different order).
 */
async function calculateRoute(nodes) {
  if (nodes.length <= 1) return [...nodes];

  // ── Resolve coordinates ──────────────────────────────────────────────────
  // Separate real ObjectIds from virtual nodes (injected current-location objects)
  const coordsMap = new Map(); // id-string → { lat, lng }

  const realIds = [];
  for (const node of nodes) {
    if (node._virtualId) {
      // Virtual node injected by the caller (e.g. driver's current location)
      coordsMap.set(node._virtualId, { lat: node.lat, lng: node.lng });
    } else {
      realIds.push(node);
    }
  }

  // Batch-fetch coordinates for real delivery IDs
  if (realIds.length > 0) {
    const docs = await DeliveryAssignment.find({ _id: { $in: realIds } });
    for (const doc of docs) {
      coordsMap.set(doc._id.toString(), {
        lat: doc.destination.lat,
        lng: doc.destination.lng
      });
    }
  }

  // Build a parallel array of { key, lat, lng } aligned with the input order
  const points = nodes.map(node => {
    const key = node._virtualId || node.toString();
    const coords = coordsMap.get(key);
    return { key, node, lat: coords?.lat ?? 0, lng: coords?.lng ?? 0 };
  });

  // ── TSP with fixed first element ────────────────────────────────────────
  const fixed = points[0];
  const rest = points.slice(1);

  if (rest.length === 0) return [fixed.node];
  if (rest.length === 1) return [fixed.node, rest[0].node];

  let bestOrder = rest;
  let bestCost = Infinity;

  for (const perm of permutations(rest)) {
    // Total cost: fixed → perm[0] → perm[1] → ... → perm[n-1]
    let totalCost = cost(fixed.lat, fixed.lng, perm[0].lat, perm[0].lng);

    for (let i = 0; i < perm.length - 1; i++) {
      totalCost += cost(perm[i].lat, perm[i].lng, perm[i + 1].lat, perm[i + 1].lng);
      // Early exit if this permutation already exceeds the best
      if (totalCost >= bestCost) break;
    }

    if (totalCost < bestCost) {
      bestCost = totalCost;
      bestOrder = perm;
    }
  }

  return [fixed.node, ...bestOrder.map(p => p.node)];
}

// ─── Next Pickup Location ────────────────────────────────────────────────────

/**
 * Determines the nearest pickup location for an agent.
 *
 * Reference point = last element of [currentLocation, ...activeDelivery destinations].
 * Queries all PickupLocations and returns the closest by Euclidean distance.
 *
 * @param {Array}  activeDeliveries - Populated DeliveryAssignment docs (with .destination).
 * @param {{ lat: number, lng: number }} currentLocation - The agent's current GPS.
 * @returns {Promise<{ lat: number, lng: number } | null>}
 */
async function getNextPickupLocation(activeDeliveries, currentLocation) {
  let refPoint;

  if (activeDeliveries && activeDeliveries.length > 0) {
    const last = activeDeliveries[activeDeliveries.length - 1];
    refPoint = last.destination || last;
  } else {
    refPoint = currentLocation;
  }

  if (!refPoint || refPoint.lat == null || refPoint.lng == null) {
    return null;
  }

  const allPickups = await PickupLocation.find({});
  if (allPickups.length === 0) return null;

  let nearest = null;
  let minDist = Infinity;

  for (const pickup of allPickups) {
    const dist = cost(refPoint.lat, refPoint.lng, pickup.location.lat, pickup.location.lng);
    if (dist < minDist) {
      minDist = dist;
      nearest = pickup;
    }
  }

  return { lat: nearest.location.lat, lng: nearest.location.lng };
}

module.exports = { cost, calculateRoute, getNextPickupLocation };
