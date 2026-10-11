/* global console */
import assert from 'node:assert/strict';
import { classifyPosition, summarizeActivity } from '../src/dashboard/dashboardUtils.js';

const now = Date.parse('2026-10-07T05:00:00Z');
const recent = { valid: true, fixTime: '2026-10-07T04:59:00Z', attributes: { motion: true } };
assert.equal(classifyPosition(recent, now), 'moving');
assert.equal(classifyPosition({ ...recent, attributes: { motion: false } }, now), 'stopped');
for (const position of [
  undefined,
  { ...recent, valid: false },
  { ...recent, valid: undefined },
  { ...recent, fixTime: 'invalid' },
  { ...recent, fixTime: '2026-10-07T04:00:00Z' },
  { ...recent, fixTime: '2026-10-08T05:00:00Z' },
]) {
  assert.equal(classifyPosition(position, now), 'stale');
}
assert.equal(classifyPosition({ ...recent, attributes: {} }, now), 'unknown');
const devices = { 1: { id: 1 }, 2: { id: 2 }, 3: { id: 3 } };
assert.deepEqual(
  summarizeActivity(
    [
      { deviceId: 1, distance: 12500, engineHours: 3600000 },
      { deviceId: 1, distance: 12500, engineHours: 3600000 },
      { deviceId: 2, distance: 0, engineHours: 0 },
      { deviceId: 3, distance: null, engineHours: -1 },
      { deviceId: 99, distance: 999999, engineHours: 999999 },
    ],
    devices,
  ),
  { count: 3, distance: 12500, engineHours: 3600000, distanceCount: 2, hoursCount: 1 },
);
assert.deepEqual(summarizeActivity([], devices), {
  count: 0,
  distance: 0,
  engineHours: 0,
  distanceCount: 0,
  hoursCount: 0,
});
console.log('Dashboard: freshness, motion, missing values, duplicate and authorized units passed');
