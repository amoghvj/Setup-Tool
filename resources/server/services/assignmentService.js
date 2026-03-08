const Agent = require('../models/Agent');

/**
 * Assignment Service
 * 
 * Evaluates available agents and determines which driver should handle
 * a new delivery based on workload balancing.
 * 
 * Current logic: Returns the agent with the fewest activeDeliveries.
 * Future: Incorporate proximity, route optimization, or custom rules.
 *
 * @param {object} coords - { lat, lng } delivery destination (reserved for future use).
 * @returns {string} The agentId of the least-loaded agent.
 */
async function assignAgent(coords) {
  const agents = await Agent.find({});

  if (!agents || agents.length === 0) {
    throw new Error('No available agents found in the system.');
  }

  // Find the agent with the smallest activeDeliveries array
  let leastLoaded = agents[0];
  for (const agent of agents) {
    if (agent.activeDeliveries.length < leastLoaded.activeDeliveries.length) {
      leastLoaded = agent;
    }
  }

  return leastLoaded.agentId;
}

module.exports = { assignAgent };
