/**
 * @fileoverview
 * Two-Opt Route Optimization Strategy
 *
 * Improves an existing route by repeatedly swapping
 * route segments until no further improvement exists.
 */

/**
 * Swaps a segment inside a route.
 *
 * @param {Object[]} route
 * @param {number} startIndex
 * @param {number} endIndex
 *
 * @returns {Object[]}
 */
function twoOptSwap(route, startIndex, endIndex) {
    return [
        ...route.slice(0, startIndex),
        ...route.slice(startIndex, endIndex + 1).reverse(),
        ...route.slice(endIndex + 1)
    ];
}

/**
 * Applies iterative two-opt optimization.
 *
 * PROCESS:
 * 1. Generate candidate route swaps.
 * 2. Evaluate candidate route cost.
 * 3. Keep improving while lower-cost routes exist.
 *
 * SYSTEM EFFECTS:
 * - None (pure function)
 *
 * @param {Object[]} route
 * @param {Object} matrix
 * @param {Function} evaluateRouteCost
 * @param {Object} [options={}]
 *
 * @returns {Object[]}
 */
function optimizeTwoOpt(
    route,
    matrix,
    evaluateRouteCost,
    options = {}
) {
    if (route.length <= 3) {
        return route.slice();
    }

    let improved = true;
    let bestRoute = route.slice();

    let bestCost = evaluateRouteCost(
        bestRoute,
        matrix,
        options
    );

    while (improved) {
        improved = false;

        for (let i = 1; i < bestRoute.length - 1; i += 1) {
            for (let j = i + 1; j < bestRoute.length; j += 1) {
                const candidate = twoOptSwap(bestRoute, i, j);

                const candidateCost = evaluateRouteCost(
                    candidate,
                    matrix,
                    options
                );

                if (candidateCost + 1e-9 < bestCost) {
                    bestRoute = candidate;
                    bestCost = candidateCost;
                    improved = true;
                    break;
                }
            }

            if (improved) {
                break;
            }
        }
    }

    return bestRoute;
}

module.exports = {
    twoOptSwap,
    optimizeTwoOpt
};