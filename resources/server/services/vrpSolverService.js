/**
 * @fileoverview
 * Vehicle Routing Problem (VRP) Solver Service
 *
 * Responsible for:
 * - Fleet-level route optimization
 * - Batch route optimization
 * - Reoptimization scheduling
 * - Optimization threshold evaluation
 * - OR-Tools abstraction layer
 *
 * Non-responsibilities:
 * - Assignment logic
 * - Database mutation
 * - Delivery lifecycle handling
 */

const {
  routingConfig
} = require('../config/routingConfig');

const {
  evaluateRoute
} = require('./routingEngineService');

/**
 * Active scheduler interval reference.
 *
 * @type {NodeJS.Timeout|null}
 */
let schedulerHandle = null;

/**
 * Determines whether an optimized route should replace
 * the current route.
 *
 * PROCESS:
 * 1. Compute percentage improvement.
 * 2. Compare against threshold.
 * 3. Return applicability decision.
 *
 * SYSTEM EFFECTS:
 * - None
 *
 * @param {number} currentCost
 * Existing route cost.
 *
 * @param {number} optimizedCost
 * Newly optimized route cost.
 *
 * @param {number} thresholdPercent
 * Minimum required improvement percentage.
 *
 * @returns {boolean}
 * Whether optimization should be applied.
 *
 * @example
 * const shouldApply =
 *   shouldApplyImprovement(
 *     120,
 *     100,
 *     5
 *   );
 */
function shouldApplyImprovement(
  currentCost,
  optimizedCost,
  thresholdPercent
) {
  if (
    !Number.isFinite(currentCost) ||
    currentCost <= 0
  ) {
    return optimizedCost < currentCost;
  }

  const improvement =
    (
      (currentCost - optimizedCost) /
      currentCost
    ) * 100;

  return improvement >= thresholdPercent;
}

/**
 * Optimizes a single driver's route.
 *
 * PROCESS:
 * 1. Evaluate route using routing engine.
 * 2. Return optimized route and cost.
 *
 * SYSTEM EFFECTS:
 * - None
 *
 * @async
 *
 * @param {Object[]} stops
 * Driver stops.
 *
 * @param {Object} [options={}]
 * Routing configuration.
 *
 * @returns {Promise<{
 *   route: Object[],
 *   optimizedCost: number
 * }>}
 *
 * Optimized driver route.
 *
 * @throws {Error}
 * Route optimization failure.
 */
async function optimizeDriverRoute(
  stops,
  options = {}
) {
  const result = await evaluateRoute(
    stops,
    options
  );

  return {
    route: result.route,
    optimizedCost: result.cost
  };
}

/**
 * Optimizes routes across an entire fleet.
 *
 * PROCESS:
 * 1. Iterate through fleet route plans.
 * 2. Optimize each route individually.
 * 3. Compare optimization improvements.
 * 4. Return optimization decisions.
 *
 * SYSTEM EFFECTS:
 * - None
 *
 * @async
 *
 * @param {Array<{
 *   driverId: string,
 *   stops: Object[],
 *   currentCost?: number
 * }>} fleetRoutes
 *
 * Fleet route collection.
 *
 * @param {Object} [options={}]
 * Optimization configuration.
 *
 * @returns {Promise<Array<{
 *   driverId: string,
 *   route: Object[],
 *   currentCost: number,
 *   optimizedCost: number,
 *   shouldApply: boolean
 * }>>}
 *
 * Fleet optimization results.
 *
 * @throws {Error}
 * Fleet optimization failure.
 */
async function optimizeFleetRoutes(
  fleetRoutes,
  options = {}
) {
  const thresholdPercent = Number(
    options.improvementThresholdPercent ??
    1
  );

  const results = [];

  for (const routePlan of fleetRoutes) {
    const optimized =
      await optimizeDriverRoute(
        routePlan.stops,
        options
      );

    const currentCost = Number(
      routePlan.currentCost ??
      Infinity
    );

    results.push({
      driverId: routePlan.driverId,
      route: optimized.route,
      currentCost,
      optimizedCost:
        optimized.optimizedCost,

      shouldApply:
        shouldApplyImprovement(
          currentCost,
          optimized.optimizedCost,
          thresholdPercent
        )
    });
  }

  return results;
}

/**
 * Placeholder abstraction layer for future OR-Tools
 * integration.
 *
 * CURRENT BEHAVIOR:
 * - Falls back to internal optimization engine.
 *
 * FUTURE BEHAVIOR:
 * - Dispatch optimization workload to OR-Tools worker.
 *
 * SYSTEM EFFECTS:
 * - None
 *
 * @async
 *
 * @param {Array<Object>} fleetRoutes
 * Fleet optimization requests.
 *
 * @param {Object} [options={}]
 * OR-Tools configuration.
 *
 * @returns {Promise<Object[]>}
 * Optimization results.
 *
 * @throws {Error}
 * OR-Tools batch execution failure.
 */
async function runOrToolsBatch(
  fleetRoutes,
  options = {}
) {
  if (!routingConfig.ortoolsEnabled) {
    return optimizeFleetRoutes(
      fleetRoutes,
      options
    );
  }

  /**
   * Future:
   * Replace with external OR-Tools worker dispatch.
   */

  return optimizeFleetRoutes(
    fleetRoutes,
    options
  );
}

/**
 * Starts recurring route reoptimization.
 *
 * PROCESS:
 * 1. Compute scheduler interval.
 * 2. Clear existing scheduler.
 * 3. Create recurring optimization loop.
 * 4. Execute provided optimization callback.
 *
 * SYSTEM EFFECTS:
 * - Creates long-running scheduler.
 *
 * @param {Function} runFn
 * Optimization execution callback.
 *
 * @param {Object} [options={}]
 * Scheduler configuration.
 *
 * @param {number} [options.intervalMinutes]
 * Optimization interval.
 *
 * @returns {NodeJS.Timeout}
 * Scheduler handle.
 *
 * @throws {Error}
 * Scheduler creation failure.
 *
 * @example
 * scheduleReoptimization(
 *   async () => {
 *     await optimizeFleetRoutes(...);
 *   },
 *   {
 *     intervalMinutes: 5
 *   }
 * );
 */
function scheduleReoptimization(
  runFn,
  options = {}
) {
  const intervalMinutes = Number(
    options.intervalMinutes ??
    routingConfig.reoptimizeIntervalMinutes
  );

  const intervalMs =
    Math.max(1, intervalMinutes) *
    60 *
    1000;

  if (schedulerHandle) {
    clearInterval(schedulerHandle);
  }

  schedulerHandle = setInterval(
    async () => {
      try {
        await runFn();
      } catch (_error) {
        /**
         * Intentionally swallowed to
         * preserve scheduler lifetime.
         */
      }
    },
    intervalMs
  );

  return schedulerHandle;
}

/**
 * Stops the active reoptimization scheduler.
 *
 * PROCESS:
 * 1. Detect active scheduler.
 * 2. Clear interval.
 * 3. Reset scheduler reference.
 *
 * SYSTEM EFFECTS:
 * - Stops recurring optimization execution.
 *
 * @returns {void}
 */
function stopReoptimizationScheduler() {
  if (schedulerHandle) {
    clearInterval(schedulerHandle);
    schedulerHandle = null;
  }
}

module.exports = {
  optimizeDriverRoute,
  optimizeFleetRoutes,
  runOrToolsBatch,
  scheduleReoptimization,
  stopReoptimizationScheduler,
  shouldApplyImprovement
};