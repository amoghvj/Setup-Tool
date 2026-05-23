/**
 * @fileoverview
 * Delivery Service — Delivery Lifecycle Orchestration
 *
 * Responsible for:
 * - Delivery creation and assignment orchestration
 * - Pickup activation workflow
 * - Delivery completion workflow
 * - Delivery cancellation workflow
 * - Agent route retrieval
 * - Delivery reassignment orchestration
 *
 * Non-responsibilities:
 * - Direct database mutation (delegated to stateService)
 * - Route optimization implementation (delegated to routingEngineService)
 * - Assignment decision logic (delegated to assignmentService)
 * - Pointer synchronization (owned by stateService)
 * - Delivery status persistence (status is derived contextually)
 *
 * Architectural Role:
 * - Orchestration layer only
 * - Coordinates stateService primitives and routingEngineService
 *
 * Transaction Ownership:
 * - Does not own transactions
 * - Delegates transactional operations to stateService primitives
 *
 * Pointer Ownership:
 * - Does not mutate pointers
 * - Pointer sync delegated entirely to stateService
 *
 * Queue Ownership:
 * - Does not directly mutate queues
 * - Queue mutations delegated to stateService
 *
 * Routing Ownership:
 * - Does not own routing logic
 * - Route optimization delegated to routingEngineService
 */

const {
    createDelivery,
    getAgent,
    getDeliveriesByIds,
    getDeliveryByOrderId,
    getAgentLocation,
    setActiveRoute,
    setNextPickupLocation,
    clearNextPickupLocation,
    replaceActiveRoute,
    syncGlobalFirstDeliveries,
    completeFirstActive,
    cancelAndDeleteDelivery
} = require('./stateService');

const {
    evaluateRoute
} = require('./routingEngineService');

const {
    normalizeStop
} = require('./matrixCacheService');

const {
    queueDeliveryToAgent,
    moveDeliveryToAgent
} = require('./assignmentService');

/**
 * ============================================
 * TYPE DEFINITIONS
 * ============================================
 */

/**
 * @typedef {Object} AssignDriverResult
 * @property {Object} agent - Updated agent state
 * @property {Object} delivery - Created delivery document
 */

/**
 * @typedef {Object} AgentRouteResult
 * @property {Object[]} activeDeliveries - Active delivery list
 * @property {{lat:number,lng:number}|null} nextPickupLocation
 */

/**
 * ============================================
 * INTERNAL HELPERS
 * ============================================
 */

/**
 * INTERNAL: Computes nextPickupLocation from active deliveries.
 *
 * Detailed Description:
 * Derives the next pickup location by evaluating the
 * optimized route of the agent's active deliveries.
 * Returns the destination of the first delivery in
 * the optimized route, or null if no active deliveries.
 *
 * PROCESS:
 * 1. Check if active deliveries exist.
 * 2. Normalize deliveries to routing stops.
 * 3. Evaluate route via routingEngineService.
 * 4. Return first stop destination.
 *
 * SYSTEM EFFECTS:
 * - None (computation only)
 *
 * INVARIANTS PRESERVED:
 * - No state mutation
 *
 * @private
 * @async
 *
 * @param {Object[]} activeDeliveries
 * Populated delivery documents.
 *
 * @param {{lat:number,lng:number}|null} currentLocation
 * Agent's current GPS location.
 *
 * @returns {Promise<{lat:number,lng:number}|null>}
 * Computed next pickup location or null.
 */
async function _computeNextPickupLocation(
    activeDeliveries,
    currentLocation
) {
    if (
        !activeDeliveries ||
        activeDeliveries.length === 0
    ) {
        return null;
    }

    const firstDelivery = activeDeliveries[0];

    if (firstDelivery && firstDelivery.destination) {
        return {
            lat: firstDelivery.destination.lat,
            lng: firstDelivery.destination.lng
        };
    }

    return null;
}

/**
 * INTERNAL: Normalizes delivery documents to routing stops.
 *
 * @private
 *
 * @param {Object[]} deliveries
 * Delivery documents with destination coordinates.
 *
 * @returns {Object[]}
 * Normalized routing stops.
 */
function _deliveriesToStops(deliveries) {
    return deliveries.map(delivery =>
        normalizeStop({
            id: delivery._id.toString(),
            lat: delivery.destination.lat,
            lng: delivery.destination.lng,
            raw: delivery
        })
    ).filter(Boolean);
}

/**
 * INTERNAL: Orders documents by ID array ordering.
 *
 * @private
 *
 * @param {string[]} ids
 * Ordered ID array.
 *
 * @param {Object[]} docs
 * Unordered document array.
 *
 * @returns {Object[]}
 * Documents ordered to match ID array.
 */
function _orderDocsByIds(ids, docs) {
    const docMap = new Map(
        docs.map(doc => [doc._id.toString(), doc])
    );

    return ids
        .map(id => docMap.get(id.toString()))
        .filter(Boolean);
}

/**
 * ============================================
 * LIFECYCLE OPERATIONS
 * ============================================
 */

/**
 * Creates and assigns a delivery to an agent.
 *
 * Detailed Description:
 * Orchestrates the full delivery creation and assignment
 * workflow. Creates the delivery document via stateService,
 * queues it to the agent via assignmentService, and
 * updates the agent's nextPickupLocation.
 *
 * PROCESS:
 * 1. Create delivery via stateService.createDelivery.
 * 2. Queue delivery to agent via assignmentService.queueDeliveryToAgent.
 * 3. Retrieve updated agent state.
 * 4. Retrieve active deliveries for pickup location computation.
 * 5. Update nextPickupLocation via stateService.
 * 6. Return updated agent.
 *
 * SYSTEM EFFECTS:
 * - Creates DeliveryAssignment (via stateService)
 * - Adds to pending queue (via stateService)
 * - Updates nextPickupLocation (via stateService)
 *
 * INVARIANTS PRESERVED:
 * - Ownership exclusivity (via stateService)
 * - Pointer consistency (via stateService)
 *
 * TRANSACTION:
 * - Delegates transaction ownership to stateService
 *
 * @async
 *
 * @param {string} agentId
 * Target agent identifier.
 *
 * @param {string|null} orderId
 * External order identifier.
 *
 * @param {{lat:number,lng:number}} coords
 * Delivery destination coordinates.
 *
 * @returns {Promise<Object>}
 * Updated agent document.
 *
 * @throws {Error}
 * Agent not found.
 *
 * @throws {Error}
 * Delivery creation failure.
 *
 * @example
 * const agent = await assignDriver(
 *   'driver-101',
 *   'ORD-123',
 *   { lat: 12.91, lng: 77.59 }
 * );
 */
async function assignDriver(agentId, orderId, coords) {
    const delivery = await createDelivery(
        orderId,
        { lat: coords.lat, lng: coords.lng }
    );

    await queueDeliveryToAgent(
        agentId,
        delivery._id
    );

    const agent = await getAgent(agentId);

    const activeDeliveries =
        await getDeliveriesByIds(
            agent.activeDeliveries || []
        );

    const orderedActive = _orderDocsByIds(
        agent.activeDeliveries || [],
        activeDeliveries
    );

    const nextPickup =
        await _computeNextPickupLocation(
            orderedActive,
            await getAgentLocation(agentId)
        );

    if (nextPickup) {
        await setNextPickupLocation(
            agentId,
            nextPickup
        );
    }

    return getAgent(agentId);
}

/**
 * Processes pickup activation for an agent.
 *
 * Detailed Description:
 * Moves all pending deliveries to the active queue
 * after optimizing the route via routingEngineService.
 * Clears nextPickupLocation after pickup activation
 * as the agent is now en route.
 *
 * PROCESS:
 * 1. Validate agent exists.
 * 2. Validate active queue is empty.
 * 3. Validate pending queue is non-empty.
 * 4. Retrieve pending delivery documents.
 * 5. Optimize route via routingEngineService.evaluateRoute.
 * 6. Activate optimized route via stateService.setActiveRoute.
 * 7. Clear nextPickupLocation via stateService.
 * 8. Sync global first deliveries via stateService.
 * 9. Return updated agent.
 *
 * SYSTEM EFFECTS:
 * - Moves pending to active (via stateService.setActiveRoute)
 * - Clears nextPickupLocation (via stateService)
 * - Syncs global first deliveries (via stateService)
 *
 * INVARIANTS PRESERVED:
 * - Active queue only populated when pending queue is consumed
 * - Pointer consistency (via stateService)
 * - Route ordering reflects optimization
 *
 * TRANSACTION:
 * - Delegates transaction ownership to stateService
 *
 * @async
 *
 * @param {string} agentId
 * Agent identifier.
 *
 * @returns {Promise<Object>}
 * Updated agent document.
 *
 * @throws {Error}
 * Agent not found.
 *
 * @throws {Error}
 * Agent still has active deliveries.
 *
 * @throws {Error}
 * No pending deliveries to pick up.
 *
 * @example
 * const agent = await processPickup('driver-101');
 */
async function processPickup(agentId) {
    const agent = await getAgent(agentId);

    if (agent.activeDeliveries.length > 0) {
        throw new Error(
            'Agent still has active deliveries. Complete them before picking up new ones.'
        );
    }

    if (agent.pendingPickupDeliveries.length === 0) {
        throw new Error(
            'No pending deliveries to pick up.'
        );
    }

    const pendingIds = [
        ...agent.pendingPickupDeliveries
    ];

    const pendingDocs =
        await getDeliveriesByIds(pendingIds);

    const orderedPending = _orderDocsByIds(
        pendingIds,
        pendingDocs
    );

    const stops = _deliveriesToStops(orderedPending);

    let optimizedIds;

    if (stops.length > 1) {
        const evaluation =
            await evaluateRoute(stops);

        optimizedIds = evaluation.route.map(
            stop => stop.raw?._id || stop.id
        );
    } else {
        optimizedIds = pendingIds;
    }

    await setActiveRoute(
        agentId,
        optimizedIds
    );

    await clearNextPickupLocation(agentId);

    await syncGlobalFirstDeliveries();

    return getAgent(agentId);
}

/**
 * Cancels a delivery by order ID.
 *
 * Detailed Description:
 * Orchestrates the full cancellation workflow. Removes
 * the delivery from whichever queue it belongs to,
 * deletes the delivery document, and handles rerouting
 * if the cancelled delivery was in the active queue.
 *
 * nextPickupLocation trigger rules:
 * - If cancelled from pending: no nextPickupLocation change
 * - If cancelled from active and remaining active > 0:
 *   reroute remaining via routingEngineService,
 *   then clear nextPickupLocation (agent is en route)
 * - If cancelled from active and remaining active = 0
 *   and pending > 0: set nextPickupLocation for pending
 * - If cancelled from active and remaining active = 0
 *   and pending = 0: clear nextPickupLocation
 *
 * PROCESS:
 * 1. Cancel and delete delivery via stateService.cancelAndDeleteDelivery.
 * 2. If was active and remaining active > 0, reroute.
 * 3. Update nextPickupLocation per trigger rules.
 * 4. Sync global first deliveries.
 * 5. Return updated agent.
 *
 * SYSTEM EFFECTS:
 * - Removes delivery from queue (via stateService)
 * - Deletes delivery document (via stateService)
 * - May reroute active queue (via routingEngineService + stateService)
 * - May update nextPickupLocation (via stateService)
 * - Syncs global first deliveries (via stateService)
 *
 * INVARIANTS PRESERVED:
 * - Pointer consistency (via stateService)
 * - Route validity after reroute
 * - No orphan deliveries
 *
 * TRANSACTION:
 * - Delegates transaction ownership to stateService
 *
 * @async
 *
 * @param {string} orderId
 * External order identifier.
 *
 * @returns {Promise<Object>}
 * Updated agent document.
 *
 * @throws {Error}
 * Delivery not found.
 *
 * @throws {Error}
 * Agent not found.
 *
 * @example
 * const agent = await cancelDelivery('ORD-123');
 */
async function cancelDelivery(orderId) {
    const result =
        await cancelAndDeleteDelivery(orderId);

    const { agent, wasActive } = result;
    const agentId = agent.agentId;

    if (wasActive) {
        const remainingIds = [
            ...agent.activeDeliveries
        ];

        if (remainingIds.length > 0) {
            const remainingDocs =
                await getDeliveriesByIds(remainingIds);

            const orderedRemaining = _orderDocsByIds(
                remainingIds,
                remainingDocs
            );

            const stops =
                _deliveriesToStops(orderedRemaining);

            if (stops.length > 1) {
                const currentLocation =
                    await getAgentLocation(agentId);

                let routingStops = stops;

                if (currentLocation) {
                    const driverStop = normalizeStop({
                        id: '__driver_location__',
                        lat: currentLocation.lat,
                        lng: currentLocation.lng
                    });

                    if (driverStop) {
                        routingStops = [
                            driverStop,
                            ...stops
                        ];
                    }
                }

                const evaluation =
                    await evaluateRoute(routingStops);

                const reorderedIds =
                    evaluation.route
                        .filter(stop =>
                            stop.id !== '__driver_location__'
                        )
                        .map(stop =>
                            stop.raw?._id || stop.id
                        );

                await replaceActiveRoute(
                    agentId,
                    reorderedIds
                );
            }

            await clearNextPickupLocation(agentId);
        } else {
            const updatedAgent =
                await getAgent(agentId);

            if (
                updatedAgent.pendingPickupDeliveries
                    .length > 0
            ) {
                const pendingDocs =
                    await getDeliveriesByIds(
                        updatedAgent
                            .pendingPickupDeliveries
                    );

                const orderedPending = _orderDocsByIds(
                    updatedAgent
                        .pendingPickupDeliveries,
                    pendingDocs
                );

                const nextPickup =
                    await _computeNextPickupLocation(
                        orderedPending,
                        await getAgentLocation(agentId)
                    );

                if (nextPickup) {
                    await setNextPickupLocation(
                        agentId,
                        nextPickup
                    );
                } else {
                    await clearNextPickupLocation(
                        agentId
                    );
                }
            } else {
                await clearNextPickupLocation(agentId);
            }
        }
    }

    await syncGlobalFirstDeliveries();

    return getAgent(agentId);
}

/**
 * Completes the current (first) active delivery for an agent.
 *
 * Detailed Description:
 * Removes and deletes the first active delivery via
 * stateService. Updates nextPickupLocation only when
 * active becomes empty and pending is non-empty.
 *
 * nextPickupLocation trigger rules:
 * - If active still has remaining: no nextPickupLocation change
 * - If active becomes empty and pending is non-empty:
 *   set nextPickupLocation from first pending delivery
 * - If active becomes empty and pending is empty:
 *   clear nextPickupLocation
 *
 * PROCESS:
 * 1. Complete first active delivery via stateService.completeFirstActive.
 * 2. Apply nextPickupLocation trigger rules.
 * 3. Sync global first deliveries.
 * 4. Return updated agent.
 *
 * SYSTEM EFFECTS:
 * - Removes first active delivery (via stateService)
 * - Deletes delivery document (via stateService)
 * - May update nextPickupLocation (via stateService)
 * - Syncs global first deliveries (via stateService)
 *
 * INVARIANTS PRESERVED:
 * - Pointer consistency (via stateService)
 * - Ownership consistency
 *
 * TRANSACTION:
 * - Delegates transaction ownership to stateService
 *
 * @async
 *
 * @param {string} agentId
 * Agent identifier.
 *
 * @returns {Promise<Object>}
 * Updated agent document.
 *
 * @throws {Error}
 * Agent not found.
 *
 * @throws {Error}
 * No active deliveries to complete.
 *
 * @example
 * const agent = await completeDelivery('driver-101');
 */
async function completeDelivery(agentId) {
    await completeFirstActive(agentId);

    const agent = await getAgent(agentId);

    if (agent.activeDeliveries.length === 0) {
        if (
            agent.pendingPickupDeliveries.length > 0
        ) {
            const pendingDocs =
                await getDeliveriesByIds(
                    agent.pendingPickupDeliveries
                );

            const orderedPending = _orderDocsByIds(
                agent.pendingPickupDeliveries,
                pendingDocs
            );

            const nextPickup =
                await _computeNextPickupLocation(
                    orderedPending,
                    await getAgentLocation(agentId)
                );

            if (nextPickup) {
                await setNextPickupLocation(
                    agentId,
                    nextPickup
                );
            } else {
                await clearNextPickupLocation(agentId);
            }
        } else {
            await clearNextPickupLocation(agentId);
        }
    }

    await syncGlobalFirstDeliveries();

    return getAgent(agentId);
}

/**
 * Retrieves the current route for an agent.
 *
 * Detailed Description:
 * Returns the agent's active delivery route and
 * nextPickupLocation for client rendering.
 *
 * PROCESS:
 * 1. Retrieve agent via stateService.
 * 2. Populate active delivery documents.
 * 3. Format route response.
 *
 * SYSTEM EFFECTS:
 * - None (read-only)
 *
 * TRANSACTION:
 * - Read-only
 *
 * @async
 *
 * @param {string} agentId
 * Agent identifier.
 *
 * @returns {Promise<AgentRouteResult>}
 * Active deliveries and next pickup location.
 *
 * @throws {Error}
 * Agent not found.
 *
 * @example
 * const route = await getAgentRoute('driver-101');
 */
async function getAgentRoute(agentId) {
    const agent = await getAgent(agentId);

    const deliveryDocs =
        await getDeliveriesByIds(
            agent.activeDeliveries || []
        );

    const orderedDocs = _orderDocsByIds(
        agent.activeDeliveries || [],
        deliveryDocs
    );

    const deliveries = orderedDocs.map(
        delivery => ({
            id: delivery._id.toString(),
            orderId: delivery.orderId || null,
            destination: delivery.destination
        })
    );

    return {
        activeDeliveries: deliveries,
        nextPickupLocation:
            agent.nextPickupLocation
    };
}

/**
 * Reassigns an existing delivery to a different agent.
 *
 * Detailed Description:
 * Orchestrates delivery transfer between agents by
 * delegating to assignmentService.moveDeliveryToAgent.
 *
 * PROCESS:
 * 1. Retrieve delivery via stateService.
 * 2. Delegate transfer to assignmentService.
 *
 * SYSTEM EFFECTS:
 * - Unassigns from current agent (via stateService)
 * - Queues to new agent (via stateService)
 *
 * INVARIANTS PRESERVED:
 * - Ownership exclusivity (via stateService)
 * - Pointer consistency (via stateService)
 *
 * TRANSACTION:
 * - Delegates transaction ownership to stateService
 *
 * @async
 *
 * @param {string} deliveryId
 * Delivery document identifier.
 *
 * @param {string} agentId
 * Target agent identifier.
 *
 * @returns {Promise<Object>}
 * Updated target agent state.
 *
 * @throws {Error}
 * Delivery not found.
 *
 * @throws {Error}
 * Transfer failure.
 *
 * @example
 * const result = await assignExistingDelivery(
 *   'delivery-id',
 *   'driver-102'
 * );
 */
async function assignExistingDelivery(
    deliveryId,
    agentId
) {
    const delivery =
        await getDeliveryByOrderId(deliveryId)
            .catch(() => null);

    let fromAgentId = null;

    if (delivery) {
        fromAgentId = delivery.agentId;
    }

    return moveDeliveryToAgent(
        deliveryId,
        fromAgentId,
        agentId
    );
}

module.exports = {
    assignDriver,
    processPickup,
    completeDelivery,
    cancelDelivery,
    getAgentRoute,
    assignExistingDelivery
};
