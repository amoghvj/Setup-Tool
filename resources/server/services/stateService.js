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
const AgentLocation = require('../models/AgentLocation');
const PickupLocation = require('../models/PickupLocation');

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

/**
 * ============================================
 * READ PRIMITIVES
 * ============================================
 */

/**
 * Retrieves a single agent by ID.
 *
 * SYSTEM EFFECTS:
 * - None (read-only)
 *
 * INVARIANTS PRESERVED:
 * - No state mutation
 *
 * @async
 * @param {string} agentId
 * @returns {Promise<AgentState>}
 *
 * @throws {Error} Database failure
 * @exception {Error} Agent not found
 */
async function getAgent(agentId) {
    const agent = await Agent.findOne({ agentId });
    if (!agent) throw new Error('Agent not found');
    return agent;
}

/**
 * Retrieves multiple agents.
 *
 * @async
 * @param {Object} [filter]
 * @returns {Promise<AgentState[]>}
 */
async function getAgents(filter = {}) {
    return Agent.find(filter);
}

/**
 * Retrieves a delivery by ID.
 *
 * @async
 * @param {string} deliveryId
 * @returns {Promise<DeliveryNode>}
 *
 * @exception {Error} Delivery not found
 */
async function getDelivery(deliveryId) {
    const delivery = await Delivery.findById(deliveryId);
    if (!delivery) throw new Error('Delivery not found');
    return delivery;
}

/**
 * Retrieves delivery by external orderId.
 *
 * @async
 * @param {string} orderId
 * @returns {Promise<DeliveryNode>}
 *
 * @exception {Error} Delivery not found
 */
async function getDeliveryByOrderId(orderId) {
    const delivery = await Delivery.findOne({ orderId });
    if (!delivery) throw new Error('Delivery not found');
    return delivery;
}

/**
 * Retrieves multiple deliveries by IDs.
 *
 * @async
 * @param {string[]} ids
 * @returns {Promise<DeliveryNode[]>}
 */
async function getDeliveriesByIds(ids) {
    return Delivery.find({ _id: { $in: ids } });
}

/**
 * ============================================
 * AGGREGATION
 * ============================================
 */

/**
 * Retrieves all deliveries committed to an agent (active + pending).
 *
 * SYSTEM EFFECTS:
 * - None (read-only)
 *
 * INVARIANTS PRESERVED:
 * - Order preserved from arrays
 *
 * @async
 * @param {string} agentId
 * @returns {Promise<DeliveryNode[]>}
 *
 * @exception {Error} Agent not found
 */
async function getAgentCommittedDeliveries(agentId) {
    const agent = await getAgent(agentId);

    const ids = [
        ...(agent.activeDeliveries || []),
        ...(agent.pendingPickupDeliveries || [])
    ];

    return getDeliveriesByIds(ids);
}

/**
 * ============================================
 * INTEGRITY
 * ============================================
 */

/**
 * Validates that all deliveries belong to the specified agent.
 *
 * SYSTEM EFFECTS:
 * - None (validation only)
 *
 * INVARIANTS PRESERVED:
 * - Prevents cross-agent assignment
 *
 * @async
 * @param {string} agentId
 * @param {string[]} deliveryIds
 *
 * @throws {Error} Database failure
 * @exception {Error} Ownership mismatch
 */
async function validateOwnership(agentId, deliveryIds) {
    const deliveries = await getDeliveriesByIds(deliveryIds);

    if (deliveries.length !== deliveryIds.length) {
        throw new Error('Invalid delivery IDs');
    }

    for (const delivery of deliveries) {
        if (delivery.agentId !== agentId) {
            throw new Error('Ownership mismatch detected');
        }
    }
}

/**
 * Removes a delivery from pending queue.
 *
 * SYSTEM EFFECTS:
 * - Removes delivery from pendingPickupDeliveries
 * - Clears pointer relationships
 *
 * INVARIANTS PRESERVED:
 * - Pointer consistency maintained
 *
 * @async
 * @param {string} agentId
 * @param {string} deliveryId
 * @param {SessionOptions} [options]
 *
 * @returns {Promise<AgentState>}
 *
 * @throws {Error} Agent not found
 * @throws {Error} Delivery not found
 */
async function removeFromPending(
    agentId,
    deliveryId,
    options = {}
) {
    const { session, ownsSession } =
        await withSession(options.session);

    try {
        const agent =
            await Agent.findOne({ agentId })
                .session(session);

        if (!agent) {
            throw new Error('Agent not found');
        }

        const exists =
            agent.pendingPickupDeliveries.some(
                id => id.toString() === deliveryId.toString()
            );

        if (!exists) {
            throw new Error(
                'Delivery not in pending queue'
            );
        }

        agent.pendingPickupDeliveries =
            agent.pendingPickupDeliveries.filter(
                id => id.toString() !== deliveryId.toString()
            );

        await agent.save({ session });

        await _syncPointersFromArray(
            agentId,
            'pending',
            session
        );

        await finalizeSession(
            session,
            ownsSession
        );

        return agent;

    } catch (err) {
        await finalizeSession(
            session,
            ownsSession,
            err
        );

        throw err;
    }
}

/**
 * Removes a delivery from active queue.
 *
 * SYSTEM EFFECTS:
 * - Removes delivery from activeDeliveries
 * - Clears pointer relationships
 *
 * INVARIANTS PRESERVED:
 * - Pointer consistency maintained
 *
 * @async
 * @param {string} agentId
 * @param {string} deliveryId
 * @param {SessionOptions} [options]
 *
 * @returns {Promise<AgentState>}
 *
 * @throws {Error} Agent not found
 * @throws {Error} Delivery not in active queue
 */
async function removeFromActive(
    agentId,
    deliveryId,
    options = {}
) {
    const { session, ownsSession } =
        await withSession(options.session);

    try {
        const agent =
            await Agent.findOne({ agentId })
                .session(session);

        if (!agent) {
            throw new Error('Agent not found');
        }

        const exists =
            agent.activeDeliveries.some(
                id => id.toString() === deliveryId.toString()
            );

        if (!exists) {
            throw new Error(
                'Delivery not in active queue'
            );
        }

        agent.activeDeliveries =
            agent.activeDeliveries.filter(
                id => id.toString() !== deliveryId.toString()
            );

        await agent.save({ session });

        await _syncPointersFromArray(
            agentId,
            'active',
            session
        );

        await finalizeSession(
            session,
            ownsSession
        );

        return agent;

    } catch (err) {
        await finalizeSession(
            session,
            ownsSession,
            err
        );

        throw err;
    }
}

/**
 * Deletes an unassigned delivery.
 *
 * SYSTEM EFFECTS:
 * - Permanently removes delivery
 *
 * INVARIANTS PRESERVED:
 * - Assigned deliveries cannot be deleted
 *
 * @async
 * @param {string} deliveryId
 * @param {SessionOptions} [options]
 *
 * @returns {Promise<boolean>}
 *
 * @throws {Error} Delivery not found
 * @throws {Error} Delivery still assigned
 */
async function deleteDelivery(
    deliveryId,
    options = {}
) {
    const { session, ownsSession } =
        await withSession(options.session);

    try {
        const delivery =
            await Delivery.findById(deliveryId)
                .session(session);

        if (!delivery) {
            throw new Error('Delivery not found');
        }

        if (delivery.agentId) {
            throw new Error(
                'Cannot delete assigned delivery'
            );
        }

        await Delivery.findByIdAndDelete(
            deliveryId,
            { session }
        );

        await finalizeSession(
            session,
            ownsSession
        );

        return true;

    } catch (err) {
        await finalizeSession(
            session,
            ownsSession,
            err
        );

        throw err;
    }
}

/**
 * Clears pending delivery queue.
 *
 * SYSTEM EFFECTS:
 * - Empties pending queue
 * - Clears delivery ownership
 * - Clears pointers
 *
 * @async
 * @param {string} agentId
 * @param {SessionOptions} [options]
 *
 * @returns {Promise<string[]>}
 *
 * Array of cleared delivery IDs.
 */
async function clearPendingQueue(
    agentId,
    options = {}
) {
    const { session, ownsSession } =
        await withSession(options.session);

    try {
        const agent =
            await Agent.findOne({ agentId })
                .session(session);

        if (!agent) {
            throw new Error('Agent not found');
        }

        const ids = [
            ...agent.pendingPickupDeliveries
        ];

        await Delivery.updateMany(
            {
                _id: { $in: ids }
            },
            {
                $set: {
                    agentId: null,
                    prevDeliveryId: null,
                    nextDeliveryId: null
                }
            },
            { session }
        );

        agent.pendingPickupDeliveries = [];

        await agent.save({ session });

        await finalizeSession(
            session,
            ownsSession
        );

        return ids;

    } catch (err) {
        await finalizeSession(
            session,
            ownsSession,
            err
        );

        throw err;
    }
}

/**
 * Replaces the active delivery route.
 *
 * SYSTEM EFFECTS:
 * - Overwrites activeDeliveries
 * - Rebuilds pointer structure
 *
 * @async
 * @param {string} agentId
 * @param {string[]} orderedIds
 * @param {SessionOptions} [options]
 *
 * @returns {Promise<AgentState>}
 */
async function replaceActiveRoute(
    agentId,
    orderedIds,
    options = {}
) {
    return setActiveRoute(
        agentId,
        orderedIds,
        options
    );
}

/**
 * Sets next pickup location.
 *
 * SYSTEM EFFECTS:
 * - Updates agent.nextPickupLocation
 *
 * @async
 * @param {string} agentId
 * @param {{lat:number,lng:number}} location
 * @param {SessionOptions} [options]
 *
 * @returns {Promise<AgentState>}
 */
async function setNextPickupLocation(
    agentId,
    location,
    options = {}
) {
    const { session, ownsSession } =
        await withSession(options.session);

    try {
        const agent =
            await Agent.findOne({ agentId })
                .session(session);

        if (!agent) {
            throw new Error('Agent not found');
        }

        agent.nextPickupLocation = location;

        await agent.save({ session });

        await finalizeSession(
            session,
            ownsSession
        );

        return agent;

    } catch (err) {
        await finalizeSession(
            session,
            ownsSession,
            err
        );

        throw err;
    }
}

/**
 * Clears next pickup location.
 *
 * SYSTEM EFFECTS:
 * - Sets nextPickupLocation to null
 *
 * @async
 * @param {string} agentId
 * @param {SessionOptions} [options]
 *
 * @returns {Promise<AgentState>}
 */
async function clearNextPickupLocation(
    agentId,
    options = {}
) {
    return setNextPickupLocation(
        agentId,
        null,
        options
    );
}

/**
 * Retrieves current GPS location of an agent.
 *
 * SYSTEM EFFECTS:
 * - None (read-only)
 *
 * @async
 * @param {string} agentId
 *
 * @returns {Promise<{lat:number,lng:number}|null>}
 */
async function getAgentLocation(agentId) {
    const location =
        await AgentLocation.findOne({ agentId });

    return location
        ? location.location
        : null;
}

/**
 * Creates a new delivery agent.
 *
 * PROCESS:
 * 1. Validate uniqueness of external agent identifier.
 * 2. Create agent document.
 * 3. Persist new agent.
 *
 * SYSTEM EFFECTS:
 * - Inserts new Agent document into database
 *
 * INVARIANTS PRESERVED:
 * - agentId uniqueness
 * - empty delivery queues on creation
 *
 * @async
 *
 * @param {string} agentId
 * External agent identifier.
 *
 * @param {SessionOptions} [options={}]
 * Optional transaction configuration.
 *
 * @returns {Promise<AgentState>}
 * Newly created agent document.
 *
 * @throws {Error}
 * Thrown if agent already exists.
 *
 * @example
 * const agent =
 *   await createAgent('driver-101');
 */
async function createAgent(
    agentId,
    options = {}
) {
    const { session, ownsSession } =
        await withSession(options.session);

    try {
        const existing =
            await Agent.findOne({ agentId })
                .session(session);

        if (existing) {
            throw new Error(
                `Agent "${agentId}" already exists.`
            );
        }

        const agent =
            new Agent({
                agentId
            });

        await agent.save({ session });

        await finalizeSession(
            session,
            ownsSession
        );

        return agent;

    } catch (err) {
        await finalizeSession(
            session,
            ownsSession,
            err
        );

        throw err;
    }
}

/**
 * Retrieves an agent using external agent identifier.
 *
 * PROCESS:
 * 1. Query agent collection.
 * 2. Validate existence.
 * 3. Return matching agent.
 *
 * SYSTEM EFFECTS:
 * - None (read-only)
 *
 * @async
 *
 * @param {string} agentId
 * External agent identifier.
 *
 * @returns {Promise<AgentState>}
 * Matching agent document.
 *
 * @throws {Error}
 * Thrown if agent does not exist.
 *
 * @example
 * const agent =
 *   await getAgentByExternalId('driver-101');
 */
async function getAgentByExternalId(agentId) {
    const agent =
        await Agent.findOne({ agentId });

    if (!agent) {
        throw new Error(
            `Agent "${agentId}" not found.`
        );
    }

    return agent;
}

/**
 * Creates or updates live agent location.
 *
 * PROCESS:
 * 1. Match existing location document by agentId.
 * 2. Update coordinates if existing.
 * 3. Create document if missing.
 *
 * SYSTEM EFFECTS:
 * - Inserts or updates AgentLocation document
 *
 * INVARIANTS PRESERVED:
 * - Single location document per agent
 *
 * @async
 *
 * @param {string} agentId
 * External agent identifier.
 *
 * @param {{
 *   lat: number,
 *   lng: number
 * }} coords
 * Current GPS coordinates.
 *
 * @param {SessionOptions} [options={}]
 * Optional transaction configuration.
 *
 * @returns {Promise<Object>}
 * Updated location document.
 *
 * @throws {Error}
 * Thrown if coordinates are invalid.
 *
 * @example
 * await upsertAgentLocation(
 *   'driver-101',
 *   { lat: 12.91, lng: 77.59 }
 * );
 */
async function upsertAgentLocation(
    agentId,
    coords,
    options = {}
) {
    const { session, ownsSession } =
        await withSession(options.session);

    try {
        if (
            coords?.lat == null ||
            coords?.lng == null
        ) {
            throw new Error(
                'coords.lat and coords.lng are required.'
            );
        }

        const location =
            await AgentLocation.findOneAndUpdate(
                {
                    agentId
                },
                {
                    location: {
                        lat: coords.lat,
                        lng: coords.lng
                    },
                    updatedAt: Date.now()
                },
                {
                    upsert: true,
                    new: true,
                    session
                }
            );

        await finalizeSession(
            session,
            ownsSession
        );

        return location;

    } catch (err) {
        await finalizeSession(
            session,
            ownsSession,
            err
        );

        throw err;
    }
}

/**
 * Creates a pickup location.
 *
 * PROCESS:
 * 1. Validate uniqueness of pickup identifier.
 * 2. Create pickup document.
 * 3. Persist pickup location.
 *
 * SYSTEM EFFECTS:
 * - Inserts PickupLocation document
 *
 * INVARIANTS PRESERVED:
 * - pickupId uniqueness
 *
 * @async
 *
 * @param {{
 *   id: string,
 *   name: string,
 *   coords: {
 *     lat: number,
 *     lng: number
 *   }
 * }} data
 * Pickup creation payload.
 *
 * @param {SessionOptions} [options={}]
 * Optional transaction configuration.
 *
 * @returns {Promise<Object>}
 * Newly created pickup location.
 *
 * @throws {Error}
 * Thrown if pickup already exists.
 *
 * @example
 * await createPickupLocation({
 *   id: 'pickup-1',
 *   name: 'Central Hub',
 *   coords: {
 *     lat: 12.91,
 *     lng: 77.59
 *   }
 * });
 */
async function createPickupLocation(
    data,
    options = {}
) {
    const { session, ownsSession } =
        await withSession(options.session);

    try {
        const existing =
            await PickupLocation.findOne({
                pickupId: data.id
            }).session(session);

        if (existing) {
            throw new Error(
                `Pickup location "${data.id}" already exists.`
            );
        }

        const pickup =
            new PickupLocation({
                pickupId: data.id,
                name: data.name,
                location: {
                    lat: data.coords.lat,
                    lng: data.coords.lng
                }
            });

        await pickup.save({ session });

        await finalizeSession(
            session,
            ownsSession
        );

        return pickup;

    } catch (err) {
        await finalizeSession(
            session,
            ownsSession,
            err
        );

        throw err;
    }
}

/**
 * Retrieves a pickup location.
 *
 * PROCESS:
 * 1. Query pickup collection.
 * 2. Validate existence.
 * 3. Return pickup document.
 *
 * SYSTEM EFFECTS:
 * - None (read-only)
 *
 * @async
 *
 * @param {string} pickupId
 * External pickup identifier.
 *
 * @returns {Promise<Object>}
 * Pickup location document.
 *
 * @throws {Error}
 * Thrown if pickup does not exist.
 *
 * @example
 * const pickup =
 *   await getPickupLocation('pickup-1');
 */
async function getPickupLocation(pickupId) {
    const pickup =
        await PickupLocation.findOne({
            pickupId
        });

    if (!pickup) {
        throw new Error(
            `Pickup location "${pickupId}" not found.`
        );
    }

    return pickup;
}

/**
 * Deletes a pickup location.
 *
 * PROCESS:
 * 1. Locate pickup by identifier.
 * 2. Remove pickup document.
 *
 * SYSTEM EFFECTS:
 * - Deletes PickupLocation document
 *
 * INVARIANTS PRESERVED:
 * - No partial deletion state
 *
 * @async
 *
 * @param {string} pickupId
 * External pickup identifier.
 *
 * @param {SessionOptions} [options={}]
 * Optional transaction configuration.
 *
 * @returns {Promise<Object>}
 * Deleted pickup document.
 *
 * @throws {Error}
 * Thrown if pickup does not exist.
 *
 * @example
 * await deletePickupLocation('pickup-1');
 */
async function deletePickupLocation(
    pickupId,
    options = {}
) {
    const { session, ownsSession } =
        await withSession(options.session);

    try {
        const deleted =
            await PickupLocation.findOneAndDelete(
                { pickupId },
                { session }
            );

        if (!deleted) {
            throw new Error(
                `Pickup location "${pickupId}" not found.`
            );
        }

        await finalizeSession(
            session,
            ownsSession
        );

        return deleted;

    } catch (err) {
        await finalizeSession(
            session,
            ownsSession,
            err
        );

        throw err;
    }
}

/**
 * Retrieves pickup locations.
 *
 * PROCESS:
 * 1. Query pickup collection.
 * 2. Apply optional filters.
 * 3. Return matching pickups.
 *
 * SYSTEM EFFECTS:
 * - None (read-only)
 *
 * @async
 *
 * @param {Object} [filter={}]
 * Optional mongodb query filter.
 *
 * @returns {Promise<Object[]>}
 * Matching pickup locations.
 *
 * @example
 * const pickups =
 *   await getPickupLocations();
 */
async function getPickupLocations(
    filter = {}
) {
    return PickupLocation.find(filter);
}

/**
 * Retrieves deliveries.
 *
 * PROCESS:
 * 1. Query delivery collection.
 * 2. Apply optional filters.
 * 3. Return matching deliveries.
 *
 * SYSTEM EFFECTS:
 * - None (read-only)
 *
 * @async
 *
 * @param {Object} [filter={}]
 * Optional mongodb query filter.
 *
 * @returns {Promise<DeliveryState[]>}
 * Matching deliveries.
 *
 * @example
 * const deliveries =
 *   await getDeliveries();
 */
async function getDeliveries(
    filter = {}
) {
    return Delivery.find(filter);
}

/**
 * ============================================
 * EXPORTS
 * ============================================
 */

module.exports = {
    createDelivery,
    addToPending,
    setActiveRoute,
    unassignDelivery,
    getList,
    getAgent,
    getAgents,
    getDelivery,
    getDeliveryByOrderId,
    getDeliveriesByIds,
    getAgentCommittedDeliveries,
    validateOwnership,
    removeFromPending,
    removeFromActive,
    deleteDelivery,
    clearPendingQueue,
    replaceActiveRoute,
    setNextPickupLocation,
    clearNextPickupLocation,
    getAgentLocation,
    createAgent,
    getAgentByExternalId,
    upsertAgentLocation,
    createPickupLocation,
    getPickupLocation,
    deletePickupLocation,
    getPickupLocations,
    getDeliveries
};
