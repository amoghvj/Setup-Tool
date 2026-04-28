const mongoose = require('mongoose');
const Agent = require('../models/Agent');
const AgentLocation = require('../models/AgentLocation');
const DeliveryAssignment = require('../models/DeliveryAssignment');
const { buildTravelMatrix, normalizeStop } = require('./matrixCacheService');
const { buildRoute, routeCost } = require('./routingService');

function isDriverAvailable(agent) {
  return (agent.activeDeliveries || []).length === 0 && (agent.pendingPickupDeliveries || []).length === 0;
}

function orderDocsByIds(ids, docs) {
  const docMap = new Map(docs.map(doc => [doc._id.toString(), doc]));
  return ids.map(id => docMap.get(id.toString())).filter(Boolean);
}

async function getAgentAnchorStop(agentId, agent) {
  const location = await AgentLocation.findOne({ agentId });
  if (location?.location?.lat != null && location?.location?.lng != null) {
    return {
      id: `${agentId}:location`,
      lat: location.location.lat,
      lng: location.location.lng
    };
  }

  if (agent?.nextPickupLocation?.lat != null && agent?.nextPickupLocation?.lng != null) {
    return {
      id: `${agentId}:next-pickup`,
      lat: agent.nextPickupLocation.lat,
      lng: agent.nextPickupLocation.lng
    };
  }

  return null;
}

async function loadAgentCommittedStops(agent) {
  const queuedIds = [...(agent.activeDeliveries || []), ...(agent.pendingPickupDeliveries || [])];
  if (queuedIds.length === 0) {
    return [];
  }

  const docs = await DeliveryAssignment.find({ _id: { $in: queuedIds } });
  return orderDocsByIds(queuedIds, docs);
}

async function buildAgentRoute(agentId, agent, extraStop = null) {
  const committedStops = await loadAgentCommittedStops(agent);
  const anchor = await getAgentAnchorStop(agentId, agent);
  const routeStops = anchor ? [anchor, ...committedStops] : [...committedStops];

  if (extraStop) {
    routeStops.push(extraStop);
  }

  return routeStops;
}

function marginalInsertionCost(currentRoute, candidateStop, matrix, options = {}) {
  const currentCost = routeCost(currentRoute, matrix, options);
  const candidateRoute = buildRoute([...currentRoute, candidateStop], matrix, options);
  const candidateCost = routeCost(candidateRoute, matrix, options);

  return {
    currentCost,
    candidateCost,
    marginalCost: candidateCost - currentCost,
    route: candidateRoute
  };
}

async function scoreAgentForDelivery(agent, deliveryStop, options = {}) {
  const committedStops = await loadAgentCommittedStops(agent);
  const anchor = await getAgentAnchorStop(agent.agentId, agent);
  const currentRoute = anchor ? [anchor, ...committedStops] : [...committedStops];
  const matrix = await buildTravelMatrix([...currentRoute, deliveryStop]);

  const { currentCost, candidateCost, marginalCost, route } = marginalInsertionCost(
    currentRoute,
    deliveryStop,
    matrix,
    {
      ...options,
      loadPenalty: currentRoute.length
    }
  );

  const availabilityPenalty = isDriverAvailable(agent) ? 0 : Number(options.busyDriverPenalty ?? 1000);

  return {
    agentId: agent.agentId,
    currentCost,
    candidateCost,
    marginalCost: marginalCost + availabilityPenalty,
    route,
    available: isDriverAvailable(agent)
  };
}

async function assignAgent(coords, options = {}) {
  const agents = await Agent.find({});

  if (!agents || agents.length === 0) {
    throw new Error('No available agents found in the system.');
  }

  const deliveryStop = normalizeStop({
    id: 'new-delivery',
    lat: coords.lat,
    lng: coords.lng
  });

  const preferredAgents = agents.filter(isDriverAvailable);
  const candidateAgents = preferredAgents.length > 0 ? preferredAgents : agents;

  let bestScore = Infinity;
  let selectedAgentId = candidateAgents[0].agentId;

  for (const agent of candidateAgents) {
    const score = await scoreAgentForDelivery(agent, deliveryStop, options);
    if (score.marginalCost < bestScore) {
      bestScore = score.marginalCost;
      selectedAgentId = agent.agentId;
    }
  }

  return selectedAgentId;
}

async function queueDeliveryToAgent(agentId, deliveryId, options = {}) {
  const session = options.session || await mongoose.startSession();
  const ownsSession = !options.session;

  try {
    if (ownsSession) {
      session.startTransaction();
    }

    const agent = await Agent.findOneAndUpdate(
      { agentId },
      {
        $addToSet: { pendingPickupDeliveries: deliveryId }
      },
      { new: true, session }
    );

    if (!agent) {
      throw new Error(`Agent "${agentId}" not found.`);
    }

    const delivery = await DeliveryAssignment.findByIdAndUpdate(
      deliveryId,
      {
        $set: {
          agentId,
          status: options.status || 'assigned'
        }
      },
      { new: true, session }
    );

    if (!delivery) {
      throw new Error(`Delivery "${deliveryId}" not found.`);
    }

    if (ownsSession) {
      await session.commitTransaction();
    }

    return { agent, delivery };
  } catch (error) {
    if (ownsSession) {
      await session.abortTransaction();
    }
    throw error;
  } finally {
    if (ownsSession) {
      session.endSession();
    }
  }
}

async function moveDeliveryToAgent(deliveryId, fromAgentId, toAgentId, options = {}) {
  const session = options.session || await mongoose.startSession();
  const ownsSession = !options.session;

  try {
    if (ownsSession) {
      session.startTransaction();
    }

    if (fromAgentId) {
      await Agent.findOneAndUpdate(
        { agentId: fromAgentId },
        {
          $pull: {
            pendingPickupDeliveries: deliveryId,
            activeDeliveries: deliveryId
          }
        },
        { new: true, session }
      );
    }

    const agent = await Agent.findOneAndUpdate(
      { agentId: toAgentId },
      {
        $addToSet: { pendingPickupDeliveries: deliveryId }
      },
      { new: true, session }
    );

    if (!agent) {
      throw new Error(`Agent "${toAgentId}" not found.`);
    }

    const delivery = await DeliveryAssignment.findByIdAndUpdate(
      deliveryId,
      {
        $set: {
          agentId: toAgentId,
          status: 'assigned'
        }
      },
      { new: true, session }
    );

    if (!delivery) {
      throw new Error(`Delivery "${deliveryId}" not found.`);
    }

    if (ownsSession) {
      await session.commitTransaction();
    }

    return { agent, delivery };
  } catch (error) {
    if (ownsSession) {
      await session.abortTransaction();
    }
    throw error;
  } finally {
    if (ownsSession) {
      session.endSession();
    }
  }
}

module.exports = {
  assignAgent,
  marginalInsertionCost,
  scoreAgentForDelivery,
  queueDeliveryToAgent,
  moveDeliveryToAgent,
  isDriverAvailable,
  buildAgentRoute
};
