const mongoose = require('mongoose');
const Agent = require('../models/Agent');
const AgentLocation = require('../models/AgentLocation');
const DeliveryAssignment = require('../models/DeliveryAssignment');
const SystemState = require('../models/SystemState');
const { calculateRoute, getNextPickupLocation } = require('./routingService');
const { queueDeliveryToAgent, moveDeliveryToAgent } = require('./assignmentService');

async function getAgentCurrentLocation(agentId) {
  const location = await AgentLocation.findOne({ agentId });
  return location ? location.location : null;
}

function orderDocsByIds(ids, docs) {
  const docMap = new Map(docs.map(doc => [doc._id.toString(), doc]));
  return ids.map(id => docMap.get(id.toString())).filter(Boolean);
}

async function syncGlobalFirstDeliveries() {
  const agents = await Agent.find({ 'activeDeliveries.0': { $exists: true } });
  const firstDeliveries = agents.map(agent => agent.activeDeliveries[0]);

  await SystemState.findOneAndUpdate(
    { configId: 'global_optiroute_state' },
    { $set: { firstDeliveries } },
    { upsert: true, new: true }
  );
}

async function refreshAgentPickupLocation(agentId, agent) {
  const populatedAgent = await Agent.findOne({ agentId }).populate('activeDeliveries');
  const currentLocation = await getAgentCurrentLocation(agentId);
  const nextPickupLocation = await getNextPickupLocation(populatedAgent?.activeDeliveries || agent?.activeDeliveries || [], currentLocation);

  agent.nextPickupLocation = nextPickupLocation;
  await agent.save();
  return agent;
}

async function assignDriver(agentId, orderId, coords) {
  const agent = await Agent.findOne({ agentId });
  if (!agent) {
    throw new Error(`Agent "${agentId}" not found. Cannot assign delivery.`);
  }

  const delivery = new DeliveryAssignment({
    agentId,
    orderId,
    destination: { lat: coords.lat, lng: coords.lng },
    status: 'assigned'
  });

  await delivery.save();
  await queueDeliveryToAgent(agentId, delivery._id, { status: 'assigned' });

  const updatedAgent = await Agent.findOne({ agentId }).populate('activeDeliveries');
  const currentLocation = await getAgentCurrentLocation(agentId);
  updatedAgent.nextPickupLocation = await getNextPickupLocation(updatedAgent.activeDeliveries, currentLocation);
  await updatedAgent.save();

  return updatedAgent;
}

async function processPickup(agentId) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const agent = await Agent.findOne({ agentId }).session(session);
    if (!agent) {
      throw new Error(`Agent "${agentId}" not found.`);
    }

    if (agent.activeDeliveries.length > 0) {
      throw new Error('Agent still has active deliveries. Complete them before picking up new ones.');
    }

    if (agent.pendingPickupDeliveries.length === 0) {
      throw new Error('No pending deliveries to pick up.');
    }

    const pendingIds = [...agent.pendingPickupDeliveries];
    const pendingDocs = await DeliveryAssignment.find({ _id: { $in: pendingIds } }).session(session);
    const orderedPending = orderDocsByIds(pendingIds, pendingDocs);
    const optimizedRoute = await calculateRoute(orderedPending);
    const optimizedIds = optimizedRoute.map(delivery => delivery._id);

    await DeliveryAssignment.updateMany(
      { _id: { $in: optimizedIds } },
      { $set: { status: 'in-progress' } },
      { session }
    );

    agent.activeDeliveries = optimizedIds;
    agent.pendingPickupDeliveries = [];
    agent.nextPickupLocation = await getNextPickupLocation(orderedPending, await getAgentCurrentLocation(agentId));
    await agent.save({ session });

    await session.commitTransaction();
    await syncGlobalFirstDeliveries();

    return agent;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

async function cancelDelivery(orderId) {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const delivery = await DeliveryAssignment.findOne({ orderId }).session(session);
    if (!delivery) {
      throw new Error(`Delivery with orderId "${orderId}" not found.`);
    }

    const deliveryId = delivery._id;
    const agentId = delivery.agentId;
    const agent = await Agent.findOne({ agentId }).session(session);

    if (!agent) {
      throw new Error(`Agent "${agentId}" not found for delivery "${orderId}".`);
    }

    const inPending = agent.pendingPickupDeliveries.some(id => id.equals(deliveryId));
    const inActive = agent.activeDeliveries.some(id => id.equals(deliveryId));

    if (inPending) {
      agent.pendingPickupDeliveries = agent.pendingPickupDeliveries.filter(id => !id.equals(deliveryId));
    } else if (inActive) {
      const remaining = agent.activeDeliveries.filter(id => !id.equals(deliveryId));
      const isFirstCancelled = agent.activeDeliveries.length > 0 && agent.activeDeliveries[0].equals(deliveryId);

      if (remaining.length > 0) {
        if (isFirstCancelled) {
          const currentLocation = await getAgentCurrentLocation(agentId);
          if (currentLocation) {
            const virtualStart = {
              _virtualId: '__driver_location__',
              lat: currentLocation.lat,
              lng: currentLocation.lng
            };
            const optimized = await calculateRoute([virtualStart, ...remaining]);
            agent.activeDeliveries = optimized.map(item => item._id || item);
          } else {
            agent.activeDeliveries = await calculateRoute(remaining);
          }
        } else {
          agent.activeDeliveries = await calculateRoute(remaining);
        }
      } else {
        agent.activeDeliveries = [];
      }

      const populatedRemaining = await DeliveryAssignment.find({ _id: { $in: agent.activeDeliveries } }).session(session);
      const nextLocation = await getAgentCurrentLocation(agentId);
      agent.nextPickupLocation = await getNextPickupLocation(populatedRemaining, nextLocation);
    }

    await agent.save({ session });

    await DeliveryAssignment.findByIdAndDelete(deliveryId).session(session);

    await session.commitTransaction();
    await syncGlobalFirstDeliveries();

    return agent;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

async function completeDelivery(agentId) {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const agent = await Agent.findOne({ agentId }).session(session);
    if (!agent) {
      throw new Error(`Agent "${agentId}" not found.`);
    }

    if (agent.activeDeliveries.length === 0) {
      throw new Error('No active deliveries to complete.');
    }

    const completedId = agent.activeDeliveries.shift();
    await agent.save({ session });

    await DeliveryAssignment.findByIdAndDelete(completedId).session(session);

    await session.commitTransaction();
    await syncGlobalFirstDeliveries();

    return agent;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

async function getAgentRoute(agentId) {
  const agent = await Agent.findOne({ agentId }).populate('activeDeliveries');
  if (!agent) {
    throw new Error(`Agent "${agentId}" not found.`);
  }

  const deliveries = agent.activeDeliveries.map(delivery => ({
    id: delivery._id.toString(),
    orderId: delivery.orderId || null,
    destination: delivery.destination,
    status: delivery.status || 'in-progress'
  }));

  return {
    activeDeliveries: deliveries,
    nextPickupLocation: agent.nextPickupLocation
  };
}

async function assignExistingDelivery(deliveryId, agentId) {
  const delivery = await DeliveryAssignment.findById(deliveryId);
  if (!delivery) {
    throw new Error(`Delivery "${deliveryId}" not found.`);
  }

  return moveDeliveryToAgent(deliveryId, delivery.agentId, agentId, { status: 'assigned' });
}

module.exports = {
  assignDriver,
  processPickup,
  completeDelivery,
  cancelDelivery,
  getAgentRoute,
  syncGlobalFirstDeliveries,
  assignExistingDelivery,
  refreshAgentPickupLocation
};
