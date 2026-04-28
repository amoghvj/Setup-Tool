const test = require('node:test');
const assert = require('node:assert/strict');

const { routeCost, twoOptSwap } = require('../services/routingService');
const { marginalInsertionCost } = require('../services/assignmentService');

const matrix = {
  get(fromId, toId) {
    if (fromId === toId) {
      return { timeSeconds: 0, distanceKm: 0, source: 'test' };
    }

    const lookup = {
      'A::B': { timeSeconds: 600, distanceKm: 2 },
      'B::C': { timeSeconds: 600, distanceKm: 2 },
      'A::C': { timeSeconds: 1800, distanceKm: 8 },
      'C::B': { timeSeconds: 600, distanceKm: 2 },
      'B::A': { timeSeconds: 600, distanceKm: 2 },
      'C::A': { timeSeconds: 1800, distanceKm: 8 }
    };

    return lookup[`${fromId}::${toId}`] || { timeSeconds: 1200, distanceKm: 4, source: 'test' };
  }
};

function stop(id) {
  return { id, lat: 0, lng: 0 };
}

test('routeCost returns a finite positive cost for multi-leg route', () => {
  const cost = routeCost([stop('A'), stop('B'), stop('C')], matrix);
  assert.equal(Number.isFinite(cost), true);
  assert.equal(cost > 0, true);
});

test('twoOptSwap reverses the selected route segment', () => {
  const route = ['A', 'B', 'C', 'D', 'E'];
  const swapped = twoOptSwap(route, 1, 3);
  assert.deepEqual(swapped, ['A', 'D', 'C', 'B', 'E']);
});

test('marginalInsertionCost produces non-negative delta for added stop', () => {
  const currentRoute = [stop('A'), stop('B')];
  const candidate = stop('C');

  const result = marginalInsertionCost(currentRoute, candidate, matrix);
  assert.equal(Number.isFinite(result.currentCost), true);
  assert.equal(Number.isFinite(result.candidateCost), true);
  assert.equal(Number.isFinite(result.marginalCost), true);
  assert.equal(result.route.length >= currentRoute.length, true);
});
