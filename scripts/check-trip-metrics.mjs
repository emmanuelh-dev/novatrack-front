/* global console */
import assert from 'node:assert/strict';

const { tripMetrics, filterTrips, tripVisits } = await import('../src/routes/tripMetrics.js').catch(
  (error) => {
    if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  },
);
assert.equal(typeof tripMetrics, 'function', 'Trip comparison metrics must exist');
assert.equal(typeof filterTrips, 'function', 'Planned-departure filtering must exist');
assert.equal(typeof tripVisits, 'function', 'Stop arrival, departure and observed stay must exist');

const now = Date.parse('2026-10-07T12:00:00Z');
const trip = {
  version: 1,
  deviceId: 1,
  status: 'completed',
  request: { departureTime: '2026-10-07T08:00:00Z' },
  plannedArrival: '2026-10-07T09:00:00Z',
  startedTime: '2026-10-07T08:10:00Z',
  arrivedTime: '2026-10-07T09:15:30Z',
  completedTime: '2026-10-07T10:00:00Z',
};
const order = (value = trip, id = 1) => ({ id, attributes: { routeTrip: value } });
const arrival = '2026-10-07T09:00:00Z';
const inside = '2026-10-07T09:05:00Z';
const departure = '2026-10-07T09:06:00Z';
const stop = {
  place: { id: 3, name: 'Planta' },
  arrivedTime: arrival,
  visit: { departedTime: departure, lastInsideTime: inside, uncertain: false },
};
const visitedTrip = { ...trip, stops: [stop], destination: { id: 4, name: 'Destino' } };
let visits = tripVisits(order(visitedTrip), now);
assert.equal(visits.length, 2, 'Includes destination and intermediate stops');
assert.equal(visits[0].duration, 360000);
assert.equal(visits[0].state, 'departed');
const stored = order({ ...visitedTrip, stops: [{ place: stop.place, arrivedTime: arrival }] });
stored.attributes.routeVisits = { 0: stop.visit };
assert.equal(
  tripVisits(stored, now)[0].duration,
  360000,
  'Orders store observations separately for rollback compatibility',
);
assert.equal(
  tripVisits(order({ ...visitedTrip, startedTime: inside }), now)[0].state,
  'incomplete',
  'An arrival before the trip start is inconsistent',
);
assert.equal(visits[1].state, 'unrecorded', 'Old arrivals do not imply a departure');
assert.equal(visits[1].duration, null, 'Completion is not departure');
for (const visit of [
  { ...stop.visit, uncertain: true },
  { ...stop.visit, departedTime: '2026-10-07T08:59:00Z' },
  { ...stop.visit, departedTime: '2026-10-08T09:06:00Z' },
  { ...stop.visit, lastInsideTime: 'invalid' },
]) {
  const row = tripVisits(order({ ...visitedTrip, stops: [{ ...stop, visit }] }), now)[0];
  assert.equal(
    row.duration,
    null,
    'GPS gaps and invalid observations never become a service total',
  );
  assert.equal(row.state, 'incomplete');
}
const ongoing = { ...stop, visit: { ...stop.visit, departedTime: null } };
visits = tripVisits(
  order({ ...visitedTrip, status: 'active', stops: [ongoing] }),
  Date.parse(inside) + 60000,
);
assert.equal(
  visits[0].duration,
  300000,
  'Ongoing stay ends at last observed inside fix, not the clock',
);
assert.equal(visits[0].state, 'inside');
assert.equal(tripVisits(order({ ...visitedTrip, stops: [ongoing] }), now)[0].duration, null);
assert.equal(
  tripVisits(order({ ...visitedTrip, status: 'active', stops: [ongoing] }), now)[0].state,
  'incomplete',
);
assert.equal(tripVisits(order({ ...trip, arrivedTime: null }), now)[0].state, 'pending');
const result = tripMetrics(order(), now);
assert.equal(result.duration, 3930000, 'Elapsed travel ends at detected arrival, not completion');
assert.equal(result.startDelta, 600000);
assert.equal(result.arrivalDelta, 930000);
assert.equal(result.arrived, true);
assert.equal(result.late, true);
const early = tripMetrics(order({ ...trip, arrivedTime: '2026-10-07T08:50:00Z' }), now);
assert.equal(early.arrivalDelta, -600000);
assert.equal(early.late, false);
assert.equal(
  tripMetrics(order({ ...trip, arrivedTime: trip.plannedArrival }), now).arrivalDelta,
  0,
);
const cancelled = tripMetrics(order({ ...trip, status: 'cancelled' }), now);
assert.equal(cancelled.arrived, false, 'Cancelled trips are excluded from adherence totals');
assert.equal(cancelled.late, false);
assert.equal(cancelled.arrivalDelta, null);
assert.equal(cancelled.startDelta, null);
for (const arrivedTime of [
  null,
  undefined,
  '',
  'invalid',
  true,
  '2026-02-30T09:00:00Z',
  '2026-10-08T09:00:00Z',
]) {
  const missing = tripMetrics(order({ ...trip, arrivedTime }), now);
  assert.equal(missing.actualArrival, null);
  assert.equal(missing.duration, null);
  assert.equal(missing.arrivalDelta, null);
  assert.equal(missing.arrived, false, 'Completed status alone does not prove arrival');
}
for (const startedTime of [null, '', 'invalid', true, '2026-10-08T08:00:00Z']) {
  const missing = tripMetrics(order({ ...trip, startedTime }), now);
  assert.equal(missing.actualStart, null);
  assert.equal(missing.duration, null);
  assert.equal(missing.startDelta, null);
}
const reversed = tripMetrics(order({ ...trip, arrivedTime: '2026-10-07T07:59:00Z' }), now);
assert.equal(reversed.actualArrival, null, 'Arrival before actual start is invalid');
assert.equal(reversed.duration, null);
assert.equal(tripMetrics(order({ ...trip, plannedArrival: 'invalid' }), now).arrivalDelta, null);
assert.equal(tripMetrics(order({ ...trip, request: {} }), now).startDelta, null);
assert.equal(tripMetrics(order({ ...trip, startedTime: trip.arrivedTime }), now).duration, 0);
assert.equal(
  tripMetrics(order({ ...trip, plannedArrival: '2026-10-08T09:00:00Z' }), now).plannedArrival,
  Date.parse('2026-10-08T09:00:00Z'),
  'Future planned dates remain valid',
);

const orders = [
  order(),
  order({ ...trip, deviceId: 2, status: 'active' }, 2),
  order({ ...trip, request: { departureTime: '2026-10-07T08:00:01Z' } }, 3),
  order({ ...trip, request: { departureTime: 'invalid' } }, 4),
  order({ ...trip, version: 2 }, 5),
];
const filters = { from: trip.request.departureTime, to: trip.request.departureTime };
assert.deepEqual(
  filterTrips(orders, filters).map((item) => item.id),
  [1, 2],
);
assert.deepEqual(
  filterTrips(orders, { ...filters, deviceId: 1 }).map((item) => item.id),
  [1],
);
assert.deepEqual(
  filterTrips(orders, { ...filters, deviceId: '2' }).map((item) => item.id),
  [2],
);
assert.deepEqual(
  filterTrips(orders, { ...filters, status: 'active' }).map((item) => item.id),
  [2],
);
assert.deepEqual(filterTrips(orders, { ...filters, from: 'invalid' }), []);
assert.deepEqual(filterTrips(orders, { ...filters, to: 'invalid' }), []);
assert.deepEqual(filterTrips(orders, { ...filters, from: '2026-02-30T08:00:00Z' }), []);
assert.deepEqual(
  filterTrips(orders, { from: '2026-10-08T08:00:00Z', to: '2026-10-07T08:00:00Z' }),
  [],
);
assert.deepEqual(filterTrips(orders, { ...filters, deviceId: 99 }), []);
assert.deepEqual(
  filterTrips(orders, filters, { 1: { id: 1, name: 'Authorized unit' } }).map((item) => item.id),
  [1],
  'Report must exclude trips whose unit is outside the authorized device map',
);
assert.deepEqual(filterTrips(orders, filters, {}), [], 'No accessible units means no report rows');
console.log(
  'Trip comparison metrics PASS: exact elapsed, early/late, missing/future/invalid times, cancellation, inclusive period and unit/status filters',
);
