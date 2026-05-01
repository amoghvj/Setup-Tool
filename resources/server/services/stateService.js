/**
 * @fileoverview
 * State Service — Core Data Mutation Layer
 *
 * Provides atomic, transactional primitives for managing:
 * - Agent delivery state
 * - Delivery assignment
 * - Pointer-based traversal structure
 *
 * Responsibilities:
 * - Maintain consistency between agent arrays and delivery pointers
 * - Enforce ownership and exclusivity constraints
 * - Provide transactional safety via MongoDB sessions
 *
 * Non-responsibilities:
 * - Routing logic
 * - Assignment decision making
 * - Status derivation (handled externally)
 */

const mongoose = require('mongoose');
const Agent = require('../models/Agent');
const Delivery = require('../models/DeliveryAssignment');

/**
 * ============================================
 * TYPE DEFINITIONS
 * ============================================
 */

/**
 * @typedef {Object} DeliveryNode
 * @property {string} _id
 * @property {string|null} agentId
 * @property {string|null} prevDeliveryId
 * @property {string|null} nextDeliveryId
 * @property {{lat:number,lng:number}} destination
 */

/**
 * @typedef {Object} AgentState
 * @property {string} agentId
 * @property {string[]} activeDeliveries
 * @property {string[]} pendingPickupDeliveries
 */

/**
 * @typedef {Object} SessionOptions
 * @property {mongoose.ClientSession} [session]
 */

/**
 * @typedef {Object} PointerTraversalResult
 * @property {string[]} before
 * @property {string[]} after
 */

/**
 * ============================================
 * SESSION MANAGEMENT
 * ============================================
 */

/**
 * Initializes or reuses a MongoDB session.
 *
 * @private
 * @async
 * @param {mongoose.ClientSession|null} session
 * @returns {Promise<{session: mongoose.ClientSession, ownsSession: boolean}>}
 *
 * @throws {Error} If session creation fails
 */
async function withSession(session) {
    if (session) return { session, ownsSession: false };

    const newSession = await mongoose.startSession();
    newSession.startTransaction();
    return { session: newSession, ownsSession: true };
}

/**
 * Finalizes session lifecycle.
 *
 * @private
 * @async
 * @param {mongoose.ClientSession} session
 * @param {boolean} ownsSession
 * @param {Error|null} error
 *
 * @throws {Error} If commit/rollback fails
 */
async function finalizeSession(session, ownsSession, error) {
    if (!ownsSession) return;

    if (error) await session.abortTransaction();
    else await session.commitTransaction();

    session.endSession();
}

/**
 * ============================================
 * VALIDATION
 * ============================================
 */

/**
 * Ensures no duplicate IDs exist.
 *
 * @private
 * @param {string[]} arr
 *
 * @throws {Error} Duplicate entries found
 */
function ensureNoDuplicates(arr) {
    const set = new Set(arr.map(id => id.toString()));
    if (set.size !== arr.length) {
        throw new Error('Duplicate delivery IDs detected');
    }
}

/**
 * ============================================
 * CORE METHODS
 * ============================================
 */

/**
 * Creates a new delivery.
 *
 * SYSTEM EFFECTS:
 * - Inserts new delivery
 * - Initializes unassigned state
 *
 * INVARIANTS PRESERVED:
 * - Delivery not assigned to any agent
 *
 * @async
 * @param {string|null} orderId
 * @param {{lat:number,lng:number}} destination
 * @param {SessionOptions} [options]
 *
 * @returns {Promise<DeliveryNode>}
 *
 * @throws {Error} Database failure
 * @exception {Error} Duplicate orderId
 *
 * @example
 * const delivery = await createDelivery("ORD123", { lat: 10, lng: 20 });
 */
async function createDelivery(orderId, destination, options = {}) {
    const { session, ownsSession } = await withSession(options.session);

    try {
        if (orderId) {
            const exists = await Delivery.findOne({ orderId }).session(session);
            if (exists) throw new Error('Order already exists');
        }

        const delivery = new Delivery({
            orderId,
            destination,
            agentId: null,
            prevDeliveryId: null,
            nextDeliveryId: null
        });

        await delivery.save({ session });

        await finalizeSession(session, ownsSession);
        return delivery;

    } catch (err) {
        await finalizeSession(session, ownsSession, err);
        throw err;
    }
}

/**
 * Adds delivery to pending queue.
 *
 * SYSTEM EFFECTS:
 * - Updates agent.pendingPickupDeliveries
 * - Sets delivery.agentId
 * - Rebuilds pointer structure
 *
 * INVARIANTS PRESERVED:
 * - Delivery exists in only one queue
 *
 * @async
 * @param {string} agentId
 * @param {string} deliveryId
 * @param {SessionOptions} [options]
 *
 * @returns {Promise<AgentState>}
 *
 * @throws {Error} Database failure
 * @exception {Error} Agent not found
 * @exception {Error} Delivery not found
 * @exception {Error} Delivery already assigned
 *
 * @example
 * await addToPending("agent1", deliveryId);
 */
async function addToPending(agentId, deliveryId, options = {}) {
    const { session, ownsSession } = await withSession(options.session);

    try {
        const agent = await Agent.findOne({ agentId }).session(session);
        if (!agent) throw new Error('Agent not found');

        const delivery = await Delivery.findById(deliveryId).session(session);
        if (!delivery) throw new Error('Delivery not found');

        if (delivery.agentId) throw new Error('Delivery already assigned');

        agent.pendingPickupDeliveries.push(deliveryId);
        delivery.agentId = agentId;

        await agent.save({ session });
        await delivery.save({ session });

        await _syncPointersFromArray(agentId, 'pending', session);

        await finalizeSession(session, ownsSession);
        return agent;

    } catch (err) {
        await finalizeSession(session, ownsSession, err);
        throw err;
    }
}

/**
 * Sets active route.
 *
 * SYSTEM EFFECTS:
 * - Moves deliveries to active queue
 * - Clears pending queue
 * - Updates pointers
 *
 * INVARIANTS PRESERVED:
 * - Pointer order matches array order
 *
 * @async
 * @param {string} agentId
 * @param {string[]} orderedIds
 * @param {SessionOptions} [options]
 *
 * @returns {Promise<AgentState>}
 *
 * @throws {Error} Database failure
 * @exception {Error} Agent not found
 * @exception {Error} Ownership mismatch
 */
async function setActiveRoute(agentId, orderedIds, options = {}) {
    const { session, ownsSession } = await withSession(options.session);

    try {
        const agent = await Agent.findOne({ agentId }).session(session);
        if (!agent) throw new Error('Agent not found');

        ensureNoDuplicates(orderedIds);

        const deliveries = await Delivery.find({ _id: { $in: orderedIds } }).session(session);
        if (deliveries.length !== orderedIds.length) {
            throw new Error('Invalid delivery IDs');
        }

        agent.activeDeliveries = orderedIds;
        agent.pendingPickupDeliveries = [];

        await agent.save({ session });

        await _syncPointersFromArray(agentId, 'active', session);

        await finalizeSession(session, ownsSession);
        return agent;

    } catch (err) {
        await finalizeSession(session, ownsSession, err);
        throw err;
    }
}

/**
 * Removes assignment of delivery.
 *
 * SYSTEM EFFECTS:
 * - Removes from agent queues
 * - Clears pointers and ownership
 *
 * @async
 * @param {string} deliveryId
 * @param {SessionOptions} [options]
 *
 * @returns {Promise<boolean>}
 *
 * @throws {Error} Database failure
 * @exception {Error} Delivery not found
 */
async function unassignDelivery(deliveryId, options = {}) {
    const { session, ownsSession } = await withSession(options.session);

    try {
        const delivery = await Delivery.findById(deliveryId).session(session);
        if (!delivery) throw new Error('Delivery not found');

        const agent = await Agent.findOne({ agentId: delivery.agentId }).session(session);

        if (agent) {
            agent.pendingPickupDeliveries =
                agent.pendingPickupDeliveries.filter(id => !id.equals(deliveryId));

            agent.activeDeliveries =
                agent.activeDeliveries.filter(id => !id.equals(deliveryId));

            await agent.save({ session });
        }

        delivery.agentId = null;
        delivery.prevDeliveryId = null;
        delivery.nextDeliveryId = null;

        await delivery.save({ session });

        await finalizeSession(session, ownsSession);
        return true;

    } catch (err) {
        await finalizeSession(session, ownsSession, err);
        throw err;
    }
}

/**
 * INTERNAL: Sync pointer structure.
 *
 * @private
 */
async function _syncPointersFromArray(agentId, type, session) {
    const agent = await Agent.findOne({ agentId }).session(session);

    const ids =
        type === 'active'
            ? agent.activeDeliveries
            : agent.pendingPickupDeliveries;

    for (let i = 0; i < ids.length; i++) {
        await Delivery.findByIdAndUpdate(ids[i], {
            prevDeliveryId: ids[i - 1] || null,
            nextDeliveryId: ids[i + 1] || null
        }, { session });
    }
}

/**
 * Traverses pointer chain.
 *
 * @async
 * @param {string} deliveryId
 * @returns {Promise<PointerTraversalResult>}
 *
 * @throws {Error} Database failure
 * @exception {Error} Cycle detected
 */
async function getList(deliveryId) {
    const start = await Delivery.findById(deliveryId);
    if (!start) throw new Error('Delivery not found');

    const visited = new Set();
    const before = [];
    let current = start;

    while (current.prevDeliveryId) {
        if (visited.has(current._id.toString())) {
            throw new Error('Cycle detected');
        }
        visited.add(current._id.toString());

        current = await Delivery.findById(current.prevDeliveryId);
        if (!current) break;

        before.unshift(current._id);
    }

    const after = [];
    current = start;

    while (current.nextDeliveryId) {
        if (visited.has(current._id.toString())) {
            throw new Error('Cycle detected');
        }
        visited.add(current._id.toString());

        current = await Delivery.findById(current.nextDeliveryId);
        if (!current) break;

        after.push(current._id);
    }

    return { before, after };
}

module.exports = {
    createDelivery,
    addToPending,
    setActiveRoute,
    unassignDelivery,
    getList
};
