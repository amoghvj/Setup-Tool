const { routingConfig } = require('../config/routingConfig');
const { buildTravelMatrix } = require('./matrixCacheService');
const { buildRoute, twoOpt, routeCost } = require('./routingService');

let schedulerHandle = null;

function shouldApplyImprovement(currentCost, optimizedCost, thresholdPercent) {
  if (!Number.isFinite(currentCost) || currentCost <= 0) {
    return optimizedCost < currentCost;
  }

  const improvement = ((currentCost - optimizedCost) / currentCost) * 100;
  return improvement >= thresholdPercent;
}

async function optimizeDriverRoute(stops, options = {}) {
  const matrix = await buildTravelMatrix(stops, options);
  const insertionRoute = buildRoute(stops, matrix, options);
  const optimizedRoute = twoOpt(insertionRoute, matrix, options);

  return {
    route: optimizedRoute,
    insertionCost: routeCost(insertionRoute, matrix, options),
    optimizedCost: routeCost(optimizedRoute, matrix, options)
  };
}

async function optimizeFleetRoutes(fleetRoutes, options = {}) {
  const thresholdPercent = Number(options.improvementThresholdPercent ?? 1);
  const results = [];

  for (const routePlan of fleetRoutes) {
    const optimized = await optimizeDriverRoute(routePlan.stops, options);
    const currentCost = Number(routePlan.currentCost ?? optimized.insertionCost);

    results.push({
      driverId: routePlan.driverId,
      route: optimized.route,
      currentCost,
      optimizedCost: optimized.optimizedCost,
      shouldApply: shouldApplyImprovement(currentCost, optimized.optimizedCost, thresholdPercent)
    });
  }

  return results;
}

async function runOrToolsBatch(fleetRoutes, options = {}) {
  if (!routingConfig.ortoolsEnabled) {
    return optimizeFleetRoutes(fleetRoutes, options);
  }

  // Placeholder implementation until an external OR-Tools worker is connected.
  // This keeps the module deployable while preserving the async contract.
  return optimizeFleetRoutes(fleetRoutes, options);
}

function scheduleReoptimization(runFn, options = {}) {
  const intervalMinutes = Number(options.intervalMinutes ?? routingConfig.reoptimizeIntervalMinutes);
  const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;

  if (schedulerHandle) {
    clearInterval(schedulerHandle);
  }

  schedulerHandle = setInterval(async () => {
    try {
      await runFn();
    } catch (_error) {
      // Intentionally swallow to keep scheduler alive in long-running processes.
    }
  }, intervalMs);

  return schedulerHandle;
}

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
