/**
 * Dummy Routing Service
 * 
 * Calculates the optimal delivery sequence for an agent.
 * 
 * Current dummy logic: Returns the delivery array as-is (no reordering).
 * Future: Use TSP solver, proximity sorting, or external routing API.
 *
 * @param {Array} deliveries - Array of delivery ObjectIds to optimize.
 * @returns {Array} An optimally ordered array of delivery IDs.
 */
function calculateRoute(deliveries) {
  // Dummy: return the array unchanged
  return [...deliveries];
}

/**
 * Dummy Next Pickup Location resolver.
 *
 * Returns the agent's currently stored pickup location unchanged.
 * Future: Dynamically select the nearest or most efficient pickup point.
 *
 * @param {object} currentPickupLocation - The agent's current { lat, lng }.
 * @returns {object} The resolved next pickup location { lat, lng }.
 */
function getNextPickupLocation(currentPickupLocation) {
  // Dummy: return the same location
  return currentPickupLocation || { lat: 0, lng: 0 };
}

module.exports = { calculateRoute, getNextPickupLocation };
