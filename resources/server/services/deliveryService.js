const Agent = require('../models/Agent');
const DeliveryAssignment = require('../models/DeliveryAssignment');
const SystemState = require('../models/SystemState');
const { calculateRoute, getNextPickupLocation } = require('./routingService');

/**
 * Ensures the global First-Deliveries array is in sync with all active agents.
 * Called after operations that modify an agent's *active* delivery queue.
 */
async function syncGlobalFirstDeliveries() {
  const agents = await Agent.find({ 'activeDeliveries.0': { $exists: true } });
  const firstDeliveries = agents.map(agent => agent.activeDeliveries[0]);

  await SystemState.findOneAndUpdate(
    { configId: 'global_optiroute_state' },
    { $set: { firstDeliveries } },
    { upsert: true, new: true }
  );
}

/**
 * Orchestrates the full delivery assignment flow using the Pickup Model.
 *
 * Steps:
 *  1. Find the selected agent.
 *  2. Create a new DeliveryAssignment document (MongoDB generates _id).
 *  3. Append the new delivery _id directly to `pendingPickupDeliveries`.
 *  4. (Route is NOT recalculated until these items are picked up).
 *
 * @param {string} agentId  - Selected agent identifier.
 * @param {string} orderId  - External order identifier from the calling system.
 * @param {object} coords   - { lat, lng } delivery destination.
 * @returns {object} The updated agent document.
 */
async function assignDriver(agentId, orderId, coords) {
  // Step 1 — Retrieve the Agent
  const agent = await Agent.findOne({ agentId });
  if (!agent) {
    throw new Error(`Agent "${agentId}" not found. Cannot assign delivery.`);
  }

  const deliveryData = {
    agentId,
    destination: { lat: coords.lat, lng: coords.lng }
  };
  if (orderId) deliveryData.orderId = orderId;

  const delivery = new DeliveryAssignment(deliveryData);
  await delivery.save();
  const newDeliveryId = delivery._id;

  // Append directly to pending queue (no routing computation needed yet)
  agent.pendingPickupDeliveries.push(newDeliveryId);
  await agent.save();

  // No active queue change, so no syncGlobalFirstDeliveries needed here
  return agent;
}

/**
 * Processes a pickup event triggered by the driver via the mobile app.
 *
 * Steps:
 *  1. Retrieve the agent record.
 *  2. Validate: activeDeliveries must be empty, pendingPickupDeliveries must have entries.
 *  3. Move pendingPickupDeliveries → activeDeliveries.
 *  4. Run route calculation on the new activeDeliveries.
 *  5. Determine the next pickup location (dummy placeholder).
 *  6. Save the updated agent and sync global first deliveries.
 *
 * @param {string} agentId - The agent identifier.
 * @returns {object} The updated agent document.
 */
async function processPickup(agentId) {
  // Step 1 — Retrieve Agent Record
  const agent = await Agent.findOne({ agentId });
  if (!agent) {
    throw new Error(`Agent "${agentId}" not found.`);
  }

  // Step 2 — Validate Pickup State
  if (agent.activeDeliveries.length > 0) {
    throw new Error('Agent still has active deliveries. Complete them before picking up new ones.');
  }
  if (agent.pendingPickupDeliveries.length === 0) {
    throw new Error('No pending deliveries to pick up.');
  }

  // Step 3 — Move Pending → Active
  const pendingIds = [...agent.pendingPickupDeliveries];

  // Step 4 — Run Route Calculation
  const optimizedRoute = calculateRoute(pendingIds);

  // Step 5 — Determine Next Pickup Location
  const nextPickup = getNextPickupLocation(agent.nextPickupLocation);

  // Step 6 — Update Agent Record
  agent.activeDeliveries = optimizedRoute;
  agent.pendingPickupDeliveries = [];
  agent.nextPickupLocation = nextPickup;
  await agent.save();

  await syncGlobalFirstDeliveries();

  return agent;
}

/**
 * Cancels a delivery and fully removes it from the system.
 *
 * Steps:
 *  1. Locate the DeliveryAssignment by external orderId.
 *  2. Retrieve the assigned agent.
 *  3. Determine if delivery is in pendingPickupDeliveries or activeDeliveries.
 *  4. If pending: remove from pendingPickupDeliveries (no route recalc).
 *  5. If active: remove from activeDeliveries, recalculate route, update nextPickupLocation.
 *  6. Delete the DeliveryAssignment document entirely.
 *  7. Sync global first deliveries.
 *
 * @param {string} orderId - The external order identifier.
 * @returns {object} The updated agent document.
 */
async function cancelDelivery(orderId) {
  // Step 1 — Locate the Delivery Assignment
  const delivery = await DeliveryAssignment.findOne({ orderId });
  if (!delivery) {
    throw new Error(`Delivery with orderId "${orderId}" not found.`);
  }
  const deliveryId = delivery._id;
  const agentId = delivery.agentId;

  // Step 2 — Retrieve the Assigned Agent
  const agent = await Agent.findOne({ agentId });
  if (!agent) {
    throw new Error(`Agent "${agentId}" not found for delivery "${orderId}".`);
  }

  // Step 3 — Determine the Delivery State
  const inPending = agent.pendingPickupDeliveries.some(id => id.equals(deliveryId));
  const inActive = agent.activeDeliveries.some(id => id.equals(deliveryId));

  if (inPending) {
    // Step 4 — Handle Pending Pickup Cancellation (no route recalc needed)
    agent.pendingPickupDeliveries = agent.pendingPickupDeliveries.filter(
      id => !id.equals(deliveryId)
    );
  } else if (inActive) {
    // Step 5 — Handle Active Delivery Cancellation (route recalc required)
    const remaining = agent.activeDeliveries.filter(id => !id.equals(deliveryId));
    agent.activeDeliveries = calculateRoute(remaining);
    agent.nextPickupLocation = getNextPickupLocation(agent.nextPickupLocation);
  }

  await agent.save();

  // Step 6 — Remove the Delivery Record permanently
  await DeliveryAssignment.findByIdAndDelete(deliveryId);

  // Step 7 — Sync global state
  await syncGlobalFirstDeliveries();

  return agent;
}

/**
 * Marks the first active delivery as completed and removes it from the system.
 *
 * Steps:
 *  1. Retrieve the agent document.
 *  2. Validate that activeDeliveries is not empty.
 *  3. Remove the first delivery ID from activeDeliveries (FIFO order).
 *  4. Delete the corresponding DeliveryAssignment record.
 *  5. Sync global first deliveries.
 *
 * @param {string} agentId - The agent identifier.
 * @returns {object} The updated agent document.
 */
async function completeDelivery(agentId) {
  // Step 1 — Retrieve Agent
  const agent = await Agent.findOne({ agentId });
  if (!agent) {
    throw new Error(`Agent "${agentId}" not found.`);
  }

  // Step 2 — Validate
  if (agent.activeDeliveries.length === 0) {
    throw new Error('No active deliveries to complete.');
  }

  // Step 3 — Remove the first delivery (current delivery being fulfilled)
  const completedId = agent.activeDeliveries.shift();
  await agent.save();

  // Step 4 — Delete the DeliveryAssignment record
  await DeliveryAssignment.findByIdAndDelete(completedId);

  // Step 5 — Sync global state
  await syncGlobalFirstDeliveries();

  return agent;
}

/**
 * Retrieves an agent's active delivery route and next pickup location.
 *
 * @param {string} agentId - The agent identifier.
 * @returns {object} { activeDeliveries, nextPickupLocation }
 */
async function getAgentRoute(agentId) {
  const agent = await Agent.findOne({ agentId });
  if (!agent) {
    throw new Error(`Agent "${agentId}" not found.`);
  }

  return {
    activeDeliveries: agent.activeDeliveries,
    nextPickupLocation: agent.nextPickupLocation
  };
}

module.exports = {
  assignDriver,
  processPickup,
  completeDelivery,
  cancelDelivery,
  getAgentRoute,
  syncGlobalFirstDeliveries
};
