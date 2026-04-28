const test = require('node:test');
const assert = require('node:assert/strict');

const mongoose = require('mongoose');
const Agent = require('../models/Agent');
const DeliveryAssignment = require('../models/DeliveryAssignment');
const { moveDeliveryToAgent } = require('../services/assignmentService');

function createFakeSession() {
  return {
    startTransaction() {},
    async commitTransaction() {},
    async abortTransaction() {},
    endSession() {}
  };
}

test('10 simultaneous assignment operations do not produce duplicate pending entries', async () => {
  const originalStartSession = mongoose.startSession;
  const originalAgentUpdate = Agent.findOneAndUpdate;
  const originalDeliveryUpdate = DeliveryAssignment.findByIdAndUpdate;

  const state = {
    agents: new Map([
      ['agent-A', { pending: [] }],
      ['agent-B', { pending: [] }]
    ]),
    deliveries: new Map()
  };

  mongoose.startSession = async () => createFakeSession();

  Agent.findOneAndUpdate = async (query, update) => {
    const agent = state.agents.get(query.agentId);
    if (!agent) return null;

    if (update.$pull) {
      const toPull = new Set(
        []
          .concat(update.$pull.pendingPickupDeliveries || [])
          .concat(update.$pull.activeDeliveries || [])
          .map(String)
      );
      agent.pending = agent.pending.filter(id => !toPull.has(String(id)));
    }

    if (update.$addToSet?.pendingPickupDeliveries != null) {
      const value = String(update.$addToSet.pendingPickupDeliveries);
      if (!agent.pending.includes(value)) {
        agent.pending.push(value);
      }
    }

    return {
      agentId: query.agentId,
      pendingPickupDeliveries: [...agent.pending]
    };
  };

  DeliveryAssignment.findByIdAndUpdate = async (deliveryId, update) => {
    const id = String(deliveryId);
    state.deliveries.set(id, {
      _id: id,
      agentId: update.$set.agentId,
      status: update.$set.status
    });
    return state.deliveries.get(id);
  };

  try {
    const tasks = [];
    for (let i = 0; i < 10; i += 1) {
      tasks.push(moveDeliveryToAgent(`delivery-${i}`, 'agent-A', 'agent-B'));
    }

    await Promise.all(tasks);

    const targetAgent = state.agents.get('agent-B');
    assert.equal(targetAgent.pending.length, 10);

    const uniqueCount = new Set(targetAgent.pending).size;
    assert.equal(uniqueCount, 10);
  } finally {
    mongoose.startSession = originalStartSession;
    Agent.findOneAndUpdate = originalAgentUpdate;
    DeliveryAssignment.findByIdAndUpdate = originalDeliveryUpdate;
  }
});
