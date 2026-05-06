/**
 * @fileoverview
 * Insertion TSP Strategy
 *
 * Responsible for constructing a delivery route using
 * a greedy insertion heuristic.
 *
 * Responsibilities:
 * - Build initial route ordering
 * - Evaluate insertion positions
 * - Remain independent from cost model implementation
 *
 * Non-responsibilities:
 * - Assignment logic
 * - Matrix construction
 * - SLA evaluation
 * - Driver selection
 */

/**
 * Inserts a stop into a route at a specified position.
 *
 * @param {Array<Object>} route
 * @param {Object} stop
 * @param {number} position
 * @returns {Array<Object>}
 */
function insertAt(route, stop, position) {
    const nextRoute = route.slice();
    nextRoute.splice(position, 0, stop);
    return nextRoute;
}

/**
 * Builds a route using insertion TSP.
 *
 * PROCESS:
 * 1. Start with fixed anchor node.
 * 2. Iterate through unvisited stops.
 * 3. Try inserting each stop at every possible position.
 * 4. Choose insertion with lowest evaluated cost.
 * 5. Repeat until all stops are inserted.
 *
 * SYSTEM EFFECTS:
 * - None (pure function)
 *
 * @param {Object[]} stops
 * @param {Object} matrix
 * @param {Function} evaluateRouteCost
 * @param {Object} [options={}]
 *
 * @returns {Object[]}
 *
 * @throws {Error} Invalid route inputs
 */
function buildInsertionRoute(
    stops,
    matrix,
    evaluateRouteCost,
    options = {}
) {
    if (!Array.isArray(stops)) {
        throw new Error('Stops must be an array');
    }

    if (stops.length <= 1) {
        return [...stops];
    }

    let route = [stops[0]];
    const unvisited = stops.slice(1);

    while (unvisited.length > 0) {
        let bestStopIndex = 0;
        let bestPosition = 1;
        let bestCost = Infinity;

        for (let stopIndex = 0; stopIndex < unvisited.length; stopIndex += 1) {
            const stop = unvisited[stopIndex];

            for (let position = 1; position <= route.length; position += 1) {
                const candidateRoute = insertAt(route, stop, position);

                const candidateCost = evaluateRouteCost(
                    candidateRoute,
                    matrix,
                    options
                );

                if (candidateCost < bestCost) {
                    bestCost = candidateCost;
                    bestStopIndex = stopIndex;
                    bestPosition = position;
                }
            }
        }

        route = insertAt(
            route,
            unvisited[bestStopIndex],
            bestPosition
        );

        unvisited.splice(bestStopIndex, 1);
    }

    return route;
}

module.exports = {
    insertAt,
    buildInsertionRoute
};