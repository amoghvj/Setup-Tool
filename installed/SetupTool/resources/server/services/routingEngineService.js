/**
 * @fileoverview
 * Routing Engine Service
 *
 * Central orchestration layer for all routing operations.
 *
 * Responsibilities:
 * - Route construction orchestration
 * - Routing strategy selection
 * - Route optimization orchestration
 * - Marginal cost evaluation
 * - Route evaluation
 * - Matrix orchestration
 *
 * Non-responsibilities:
 * - Database mutation
 * - Assignment decisions
 * - Delivery lifecycle management
 */

const { buildTravelMatrix } = require('./matrixCacheService');
const { buildInsertionRoute } = require('../routingStrategies/insertionStrategy');
const { optimizeTwoOpt } = require('../routingStrategies/twoOptStrategy');
const { routeCost } = require('./costModelService');

/**
 * Supported routing strategies.
 *
 * @enum {string}
 */
const RoutingStrategies = {
    INSERTION: 'insertion'
};

/**
 * Builds a route using the selected routing strategy.
 *
 * PROCESS:
 * 1. Select routing algorithm.
 * 2. Build initial route ordering.
 * 3. Return constructed route.
 *
 * SYSTEM EFFECTS:
 * - None
 *
 * @param {Object[]} stops
 * Ordered collection of stops to route.
 *
 * @param {Object} matrix
 * Precomputed travel matrix.
 *
 * @param {Object} [options={}]
 * Additional routing options.
 *
 * @param {string} [options.strategy='insertion']
 * Routing strategy identifier.
 *
 * @returns {Object[]}
 * Constructed route ordering.
 *
 * @throws {Error}
 * Unsupported routing strategy.
 */
function buildRoute(
    stops,
    matrix,
    options = {}
) {
    const strategy =
        options.strategy ||
        RoutingStrategies.INSERTION;

    switch (strategy) {
        case RoutingStrategies.INSERTION:
            return buildInsertionRoute(
                stops,
                matrix,
                routeCost,
                options
            );

        default:
            throw new Error(
                `Unsupported routing strategy: ${strategy}`
            );
    }
}

/**
 * Optimizes an existing route.
 *
 * PROCESS:
 * 1. Receive existing route.
 * 2. Apply optimization strategy.
 * 3. Return optimized route.
 *
 * SYSTEM EFFECTS:
 * - None
 *
 * @param {Object[]} route
 * Existing route ordering.
 *
 * @param {Object} matrix
 * Precomputed travel matrix.
 *
 * @param {Object} [options={}]
 * Optimization options.
 *
 * @param {boolean} [options.disableOptimization=false]
 * Disables optimization stage.
 *
 * @returns {Object[]}
 * Optimized route ordering.
 */
function optimizeRoute(
    route,
    matrix,
    options = {}
) {
    if (options.disableOptimization) {
        return route;
    }

    return optimizeTwoOpt(
        route,
        matrix,
        routeCost,
        options
    );
}

/**
 * Evaluates a complete route.
 *
 * PROCESS:
 * 1. Build travel matrix.
 * 2. Construct route using selected strategy.
 * 3. Apply optimization phase.
 * 4. Compute final route cost.
 *
 * SYSTEM EFFECTS:
 * - None
 *
 * @async
 *
 * @param {Object[]} stops
 * Stops to route.
 *
 * @param {Object} [options={}]
 * Routing configuration.
 *
 * @returns {Promise<{
 *   matrix: Object,
 *   route: Object[],
 *   cost: number
 * }>}
 *
 * Route evaluation result.
 *
 * @throws {Error}
 * Route evaluation failure.
 *
 * @example
 * const result = await evaluateRoute(
 *   deliveries,
 *   {
 *     strategy: 'insertion'
 *   }
 * );
 */
async function evaluateRoute(
    stops,
    options = {}
) {
    const matrix = await buildTravelMatrix(
        stops,
        options
    );

    const initialRoute = buildRoute(
        stops,
        matrix,
        options
    );

    const optimizedRoute = optimizeRoute(
        initialRoute,
        matrix,
        options
    );

    return {
        matrix,
        route: optimizedRoute,
        cost: routeCost(
            optimizedRoute,
            matrix,
            options
        )
    };
}

/**
 * Evaluates the marginal cost of inserting a stop
 * into an existing route.
 *
 * PROCESS:
 * 1. Evaluate current route cost.
 * 2. Append candidate stop.
 * 3. Rebuild route using selected strategy.
 * 4. Optimize rebuilt route.
 * 5. Compute candidate route cost.
 * 6. Return cost delta.
 *
 * SYSTEM EFFECTS:
 * - None
 *
 * @async
 *
 * @param {Object[]} currentRoute
 * Existing route.
 *
 * @param {Object} candidateStop
 * Stop to insert.
 *
 * @param {Object} [options={}]
 * Routing configuration.
 *
 * @returns {Promise<{
 *   matrix: Object,
 *   route: Object[],
 *   currentCost: number,
 *   candidateCost: number,
 *   marginalCost: number
 * }>}
 *
 * Marginal route evaluation result.
 *
 * @throws {Error}
 * Marginal evaluation failure.
 *
 * @example
 * const result = await evaluateInsertion(
 *   existingRoute,
 *   newDelivery
 * );
 */
async function evaluateInsertion(
    currentRoute,
    candidateStop,
    options = {}
) {
    const candidateStops = [
        ...currentRoute,
        candidateStop
    ];

    const matrix = await buildTravelMatrix(
        candidateStops,
        options
    );

    const currentCost = routeCost(
        currentRoute,
        matrix,
        options
    );

    const candidateRoute = buildRoute(
        candidateStops,
        matrix,
        options
    );

    const optimizedRoute = optimizeRoute(
        candidateRoute,
        matrix,
        options
    );

    const candidateCost = routeCost(
        optimizedRoute,
        matrix,
        options
    );

    return {
        matrix,
        route: optimizedRoute,
        currentCost,
        candidateCost,
        marginalCost:
            candidateCost - currentCost
    };
}

module.exports = {
    RoutingStrategies,
    buildRoute,
    optimizeRoute,
    evaluateRoute,
    evaluateInsertion
};