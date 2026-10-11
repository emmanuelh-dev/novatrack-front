/* global console */
import assert from 'node:assert/strict';
import { activityTotals, activityQuery } from '../src/reports/common/activity.js';

const base = {
  observedMillis: 60_000,
  stoppedMillis: 60_000,
  idleMillis: 0,
  ignitionUnknownMillis: 60_000,
  motionUnknownMillis: 60_000,
  uncoveredMillis: 540_000,
  positionCount: 2,
  outsidePlacesMillis: null,
};
assert.deepEqual(activityTotals([base, base]), {
  observedMillis: 120_000,
  stoppedMillis: 120_000,
  idleMillis: 0,
  ignitionUnknownMillis: 120_000,
  motionUnknownMillis: 120_000,
  uncoveredMillis: 1_080_000,
  positionCount: 4,
  outsidePlacesMillis: null,
});
assert.equal(
  activityTotals([
    { ...base, outsidePlacesMillis: 30_000 },
    { ...base, outsidePlacesMillis: 0 },
  ]).outsidePlacesMillis,
  30_000,
);
assert.equal(
  activityTotals([base, { ...base, outsidePlacesMillis: 30_000 }]).outsidePlacesMillis,
  null,
);
assert.equal(activityTotals([]).outsidePlacesMillis, null);
assert.equal(activityTotals([]).observedMillis, 0);

console.log('Activity totals: durations, partial selection and unavailable-place values passed');

const query = activityQuery({
  from: '2026-10-07T00:00:00Z',
  to: '2026-10-08T00:00:00Z',
  deviceIds: ['all', 3],
  groupIds: [4],
  geofenceIds: [5, 6],
});
assert.deepEqual(query.getAll('deviceId'), ['3']);
assert.deepEqual(query.getAll('groupId'), ['4']);
assert.deepEqual(query.getAll('geofenceId'), ['5', '6']);
assert.equal(query.get('from'), '2026-10-07T00:00:00Z');
assert.notEqual(
  query.toString(),
  activityQuery({
    from: '2026-10-07T00:00:00Z',
    to: '2026-10-08T00:00:00Z',
    deviceIds: [7],
    groupIds: [4],
    geofenceIds: [5, 6],
  }).toString(),
);
