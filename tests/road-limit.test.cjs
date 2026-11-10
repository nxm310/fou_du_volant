const { test } = require('node:test');
const assert = require('node:assert/strict');

test('only a nearby unambiguous posted limit is shown', async () => {
  global.localStorage = { getItem: () => null };
  const { readRoadLimit } = await import('../js/geo/road-limit.js');
  const position = { heading: 90, accuracy: 10 };
  const edge = { heading: 90, distance: 4, edge_info: { speed_limit: 50 } };
  const lookup = (...edges) => readRoadLimit([{ edges }], position);
  assert.equal(lookup(edge), 50);
  assert.equal(lookup({ ...edge, heading: 270 }), null);
  assert.equal(lookup({ ...edge, distance: 25 }), null);
  assert.equal(lookup({ ...edge, edge_info: { speed_limit: 0 } }), null);
  assert.equal(lookup({ ...edge, edge_info: { speed_limit: 50, conditional_speed_limits: { wet: 30 } } }), null);
  assert.equal(lookup(edge, { ...edge, distance: 8, edge_info: { speed_limit: 80 } }), null);
});
