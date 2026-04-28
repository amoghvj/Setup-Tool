const test = require('node:test');
const assert = require('node:assert/strict');

const { buildTravelMatrix } = require('../services/matrixCacheService');
const { buildRoute, twoOpt, routeCost } = require('../services/routingService');

function createStops(count) {
  const anchor = { id: 'depot', lat: 40.7128, lng: -74.0060 };
  const stops = [anchor];

  for (let i = 1; i <= count; i += 1) {
    stops.push({
      id: `S-${i}`,
      lat: 40.7128 + (i % 5) * 0.01,
      lng: -74.0060 + (i % 4) * 0.01
    });
  }

  return stops;
}

test('20-stop optimization has cost <= insertion-only route cost', async () => {
  const stops = createStops(20);
  const matrix = await buildTravelMatrix(stops, { skipRoadMatrix: true });

  const insertionRoute = buildRoute(stops, matrix);
  const insertionCost = routeCost(insertionRoute, matrix);

  const optimized = twoOpt(insertionRoute, matrix);
  const optimizedCost = routeCost(optimized, matrix);

  assert.equal(optimized.length, insertionRoute.length);
  assert.equal(optimizedCost <= insertionCost + 1e-9, true);
});
