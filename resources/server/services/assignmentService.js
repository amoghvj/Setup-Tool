/**
 * @fileoverview
 * Assignment Service
 *
 * Responsible for:
 * - Agent selection
 * - Marginal route evaluation
 * - Delivery assignment orchestration
 * - Candidate filtering
 *
 * Non-responsibilities:
 * - Direct database mutation
 * - Route optimization implementation
 * - Delivery lifecycle management
 * - Transaction ownership
 */

const {
  getAgents,
  getAgentCommittedDeliveries,
  getDelivery,
  addToPending,
  unassignDelivery
} = require('./stateService');

const {
  normalizeStop
} = require('./matrixCacheService');

const {
  evaluateInsertion
} = require('./routingEngineService');

/**
 * Determines whether an agent is currently available.
 *
 * AVAILABILITY RULE:
 * - No active deliveries
 * - No pending deliveries
 *
 * SYSTEM EFFECTS:
 * - None
 *
 * @param {Object} agent
 * Agent document.
 *
 * @returns {boolean}
 * Availability status.
 */
function isAvailable(agent) {
  return (
    (agent.activeDeliveries || []).length === 0 &&
    (agent.pendingPickupDeliveries || []).length === 0
  );
}

/**
 * Builds the committed stop list for an agent.
 *
 * PROCESS:
 * 1. Retrieve all committed deliveries.
 * 2. Preserve active + pending ordering.
 * 3. Return normalized route stops.
 *
 * SYSTEM EFFECTS:
 * - None
 *
 * @async
 *
 * @param {string} agentId
 * Agent identifier.
 *
 * @returns {Promise<Object[]>}
 * Ordered committed stops.
 *
 * @throws {Error}
 * Agent retrieval failure.
 */
async function buildCommittedStops(agentId) {
  const deliveries =
    await getAgentCommittedDeliveries(agentId);

  return deliveries.map(delivery =>
    normalizeStop({
      id: delivery._id.toString(),
      lat: delivery.destination.lat,
      lng: delivery.destination.lng,
      raw: delivery
    })
  );
}

/**
 * Scores an agent for a candidate delivery.
 *
 * PROCESS:
 * 1. Build committed route.
 * 2. Evaluate marginal insertion cost.
 * 3. Apply availability penalties.
 * 4. Return candidate score.
 *
 * SYSTEM EFFECTS:
 * - None
 *
 * @async
 *
 * @param {Object} agent
 * Agent document.
 *
 * @param {Object} deliveryStop
 * Candidate delivery stop.
 *
 * @param {Object} [options={}]
 * Assignment configuration.
 *
 * @param {number} [options.busyDriverPenalty=1000]
 * Penalty for already-busy drivers.
 *
 * @returns {Promise<{
 *   agentId: string,
 *   currentCost: number,
 *   candidateCost: number,
 *   marginalCost: number,
 *   route: Object[],
 *   available: boolean
 * }>}
 *
 * Candidate scoring result.
 *
 * @throws {Error}
 * Route evaluation failure.
 */
async function scoreAgentForDelivery(
  agent,
  deliveryStop,
  options = {}
) {
  const currentRoute =
    await buildCommittedStops(agent.agentId);

  const evaluation =
    await evaluateInsertion(
      currentRoute,
      deliveryStop,
      options
    );

  const availabilityPenalty =
    isAvailable(agent)
      ? 0
      : Number(
        options.busyDriverPenalty ?? 1000
      );

  return {
    agentId: agent.agentId,
    currentCost:
      evaluation.currentCost,

    candidateCost:
      evaluation.candidateCost,

    marginalCost:
      evaluation.marginalCost +
      availabilityPenalty,

    route:
      evaluation.route,

    available:
      isAvailable(agent)
  };
}

/**
 * Selects the best agent for a delivery.
 *
 * PROCESS:
 * 1. Retrieve candidate agents.
 * 2. Normalize delivery stop.
 * 3. Score candidate agents.
 * 4. Select lowest marginal cost.
 * 5. Return selected agent.
 *
 * SYSTEM EFFECTS:
 * - None
 *
 * @async
 *
 * @param {{
 *   lat: number,
 *   lng: number
 * }} coords
 * Delivery coordinates.
 *
 * @param {Object} [options={}]
 * Assignment configuration.
 *
 * @returns {Promise<string>}
 * Selected agent identifier.
 *
 * @throws {Error}
 * No agents available.
 *
 * @example
 * const agentId =
 *   await assignAgent({
 *     lat: 12.91,
 *     lng: 77.59
 *   });
 */
async function assignAgent(
  coords,
  options = {}
) {
  const agents =
    await getAgents();

  if (!agents || agents.length === 0) {
    throw new Error(
      'No agents found in the system.'
    );
  }

  const deliveryStop =
    normalizeStop({
      id: 'candidate-delivery',
      lat: coords.lat,
      lng: coords.lng
    });

  const preferredAgents =
    agents.filter(isAvailable);

  const candidateAgents =
    preferredAgents.length > 0
      ? preferredAgents
      : agents;

  let bestScore = Infinity;
  let selectedAgentId = null;

  for (const agent of candidateAgents) {
    const score =
      await scoreAgentForDelivery(
        agent,
        deliveryStop,
        options
      );

    if (score.marginalCost < bestScore) {
      bestScore =
        score.marginalCost;

      selectedAgentId =
        agent.agentId;
    }
  }

  return selectedAgentId;
}

/**
 * Queues a delivery for an agent.
 *
 * PROCESS:
 * 1. Validate delivery existence.
 * 2. Delegate queue mutation to stateService.
 * 3. Return updated assignment state.
 *
 * SYSTEM EFFECTS:
 * - Adds delivery to pending queue
 * - Assigns ownership to agent
 * - Updates pointer structure
 *
 * @async
 *
 * @param {string} agentId
 * Target agent identifier.
 *
 * @param {string} deliveryId
 * Delivery identifier.
 *
 * @param {Object} [options={}]
 * Transaction configuration.
 *
 * @returns {Promise<Object>}
 * Updated agent state.
 *
 * @throws {Error}
 * Assignment failure.
 */
async function queueDeliveryToAgent(
  agentId,
  deliveryId,
  options = {}
) {
  await getDelivery(deliveryId);

  return addToPending(
    agentId,
    deliveryId,
    options
  );
}

/**
 * Moves a delivery between agents.
 *
 * PROCESS:
 * 1. Unassign delivery from current owner.
 * 2. Queue delivery to target agent.
 * 3. Preserve transaction scope.
 *
 * SYSTEM EFFECTS:
 * - Removes old ownership
 * - Adds new ownership
 * - Rebuilds queue pointers
 *
 * @async
 *
 * @param {string} deliveryId
 * Delivery identifier.
 *
 * @param {string|null} fromAgentId
 * Previous agent identifier.
 *
 * @param {string} toAgentId
 * Target agent identifier.
 *
 * @param {Object} [options={}]
 * Transaction configuration.
 *
 * @returns {Promise<Object>}
 * Updated target agent state.
 *
 * @throws {Error}
 * Transfer failure.
 */
async function moveDeliveryToAgent(
  deliveryId,
  fromAgentId,
  toAgentId,
  options = {}
) {
  if (fromAgentId) {
    await unassignDelivery(
      deliveryId,
      options
    );
  }

  return addToPending(
    toAgentId,
    deliveryId,
    options
  );
}

module.exports = {
  assignAgent,
  scoreAgentForDelivery,
  queueDeliveryToAgent,
  moveDeliveryToAgent,
  isDriverAvailable: isAvailable,
  buildCommittedStops
};