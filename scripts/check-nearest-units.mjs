/* global console */
import assert from 'node:assert/strict';
import { nearestUnits } from '../src/routes/nearestUnits.js';

const now = Date.parse('2026-10-07T12:00:00Z');
const devices = Object.fromEntries(
  [1, 2, 3, 4, 5, 6, 7, 8].map((id) => [id, { id, name: `Unit ${id}` }]),
);
const point = { latitude: 25.7, longitude: -100.3 };
const position = (deviceId, latitude, patch = {}) => ({
  deviceId,
  latitude,
  longitude: -100.3,
  valid: true,
  fixTime: new Date(now - 60000).toISOString(),
  ...patch,
});
const positions = {
  1: position(1, 25.8),
  2: position(2, 25.71),
  3: position(3, 25.7, { fixTime: new Date(now - 300001).toISOString() }),
  4: position(4, 25.7, { valid: false }),
  5: position(5, 25.7, { fixTime: new Date(now + 1).toISOString() }),
  6: position(6, NaN),
  7: position(99, 25.7),
  8: position(8, 91),
  99: position(99, 25.7),
};
const rows = nearestUnits(devices, positions, point, now);
assert.deepEqual(
  rows.map((row) => row.device.id),
  [2, 1],
);
assert.ok(rows[0].distance > 1100 && rows[0].distance < 1120);
assert.deepEqual(nearestUnits(devices, positions, { latitude: '', longitude: '' }, now), []);
assert.deepEqual(nearestUnits(devices, positions, point, NaN), []);
assert.deepEqual(
  nearestUnits({ 1: devices[1], 2: devices[2] }, positions, point, now + 300000),
  [],
);
assert.equal(nearestUnits({ 1: devices[1] }, { 1: position(1, 25.7) }, point, now)[0].distance, 0);
assert.equal(
  nearestUnits({ 1: devices[1] }, { 1: position(1, 25.7, { latitude: true }) }, point, now).length,
  0,
);
assert.equal(
  nearestUnits({ 1: devices[1] }, { 1: position(1, 25.7, { fixTime: 'bad' }) }, point, now).length,
  0,
);
assert.equal(
  nearestUnits(
    { 1: devices[1] },
    { 1: position(1, 25.7, { fixTime: new Date(now - 300000).toISOString() }) },
    point,
    now,
  ).length,
  1,
);
console.log(
  'Nearest units: authorized GPS, five-minute freshness, geodesic sorting, invalid data and zero distance PASS',
);
