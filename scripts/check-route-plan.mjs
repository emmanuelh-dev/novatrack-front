/* global console, URL */
import assert from 'node:assert/strict';
import { routeRequest, savedRoute, placePoint } from '../src/routes/routePlan.js';
const plan = {
  origin: { latitude: '0', longitude: '-99.13' },
  destination: { latitude: '19.44', longitude: '-99.14' },
  profile: 'car',
  departureTime: '',
};
assert.equal(routeRequest(plan).origin.latitude, 0);
assert.equal(routeRequest({ ...plan, origin: { latitude: '', longitude: '-99.13' } }), null);
assert.equal(routeRequest({ ...plan, origin: { latitude: 'NaN', longitude: '-99.13' } }), null);
assert.equal(routeRequest({ ...plan, destination: plan.origin }), null);
assert.equal(routeRequest({ ...plan, profile: 'truck' }), null);
const truck = { height: '4.1', width: '2.6', length: '18', weight: '32', axleload: '9' };
assert.equal(routeRequest({ ...plan, profile: 'truck', truck }).truck.weight, 32);
assert.equal(
  routeRequest({ ...plan, profile: 'truck', truck: { ...truck, axleload: '33' } }),
  null,
);
assert.equal(routeRequest({ ...plan, departureTime: 'bad-date' }), null);
assert.match(routeRequest({ ...plan, departureTime: '2026-10-08T08:00' }).departureTime, /Z$/);
const order = { id: 1, attributes: { routePlan: { version: 1, ...routeRequest(plan) } } };
assert.equal(savedRoute(order).origin.latitude, 0);
assert.equal(savedRoute({ ...order, attributes: { routePlan: { version: 2 } } }), null);
assert.equal(
  savedRoute({ ...order, attributes: { routePlan: { version: 1, ...plan, origin: null } } }),
  null,
);
const departureTime = '2026-11-01T09:30:12.345Z';
const reopened = savedRoute({ attributes: { routePlan: { version: 1, ...plan, departureTime } } });
assert.equal(routeRequest(reopened).departureTime, departureTime);
assert.equal(routeRequest({ ...plan, origin: { latitude: true, longitude: '-99.13' } }), null);
console.log('Route plan validation PASS');

assert.deepEqual(placePoint({ area: 'CIRCLE (25.71 -100.3, 150)', attributes: {} }), {
  latitude: 25.71,
  longitude: -100.3,
});
const polygonPoint = placePoint({
  area: 'POLYGON ((25.6 -100.4, 25.6 -100.2, 25.8 -100.2, 25.8 -100.4, 25.6 -100.4))',
  attributes: { routePlace: { version: 1, latitude: 0, longitude: 0 } },
});
assert.ok(Math.abs(polygonPoint.latitude - 25.7) < 0.000001);
assert.ok(Math.abs(polygonPoint.longitude + 100.3) < 0.000001);
for (const area of [
  'CIRCLE (NaN -100.3, 150)',
  'CIRCLE (25 -100, 0)',
  'POLYGON ((91 -100, 25 -100, 25 -99, 91 -100))',
  'LINESTRING (25 -100, 26 -100)',
  'broken',
]) {
  assert.equal(placePoint({ area }), null);
}
assert.equal(placePoint(null), null);
console.log('Native geofence routing points PASS');

const waypoints = [
  { latitude: 25.73, longitude: -100.3 },
  { latitude: 25.74, longitude: -100.31 },
];
assert.deepEqual(routeRequest({ ...plan, waypoints }).waypoints, waypoints);
assert.deepEqual(
  savedRoute({ attributes: { routePlan: { version: 1, ...plan, waypoints } } }).waypoints,
  waypoints,
);
for (const invalid of [
  null,
  'bad',
  [null],
  Array(11).fill(waypoints[0]),
  [plan.origin],
  [plan.destination],
]) {
  assert.equal(routeRequest({ ...plan, waypoints: invalid }), null);
}
console.log('Ordered intermediate routing points PASS');

const { tollRequest, validTollQuote } = await import('../src/routes/routePlan.js');
const mexico = { ...plan, origin: { latitude: 25.7, longitude: -100.3 } };
assert.equal(tollRequest(mexico, 2, 0, 'optimal').axles, 2);
assert.equal(tollRequest({ ...mexico, profile: 'truck' }, 5, 2, 'toll').axles, 5);
for (const [item, axles, extra, preference] of [
  [plan, 2, 0, 'optimal'],
  [mexico, 3, 0, 'optimal'],
  [mexico, 2, 6, 'optimal'],
  [mexico, 2.5, 0, 'optimal'],
  [mexico, 2, 0, 'unknown'],
  [{ ...mexico, waypoints }, 2, 0, 'optimal'],
  [{ ...mexico, profile: 'truck' }, 10, 0, 'optimal'],
])
  assert.equal(tollRequest(item, axles, extra, preference), null);
const quote = {
  currency: 'MXN',
  total: 100.25,
  source: 'INEGI synthetic',
  calculatedAt: new Date().toISOString(),
  route: {
    provider: 'inegi-sakbe',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-100.3, 25.7],
        [-99.14, 19.44],
      ],
    },
    distance: 1000,
    duration: 100,
  },
  charges: [{ amount: 100.25, description: 'Demo' }],
};
assert.ok(validTollQuote(quote));
assert.ok(validTollQuote({ ...quote, charges: [{ ...quote.charges[0], point: null }] }));
assert.ok(
  validTollQuote({
    ...quote,
    charges: [{ ...quote.charges[0], point: { latitude: 25.7, longitude: -100.3 } }],
  }),
);
for (const point of [
  { latitude: 91, longitude: -100.3 },
  { latitude: null, longitude: -100.3 },
  {},
]) {
  assert.ok(
    !validTollQuote({ ...quote, charges: [{ ...quote.charges[0], point }] }),
    'Invalid booth coordinates must not reach the map',
  );
}
assert.ok(validTollQuote({ ...quote, total: 0, charges: [] }));
assert.ok(!validTollQuote({ ...quote, total: null }));
assert.ok(!validTollQuote({ ...quote, charges: [] }));
assert.ok(!validTollQuote({ ...quote, charges: [{ description: 'Missing price' }] }));
assert.ok(!validTollQuote({ ...quote, route: { ...quote.route, provider: 'openrouteservice' } }));
console.log('Toll request and quote validation PASS');

const { validRouteAlternatives } = await import('../src/routes/routePlan.js');
const road = {
  geometry: {
    type: 'LineString',
    coordinates: [
      [-100.3, 25.7],
      [-100.31, 25.71],
    ],
  },
  distance: 1200,
  duration: 120,
  arrivalTime: '2026-10-09T20:00:00Z',
  tollways: [{ start: 0, end: 1, value: 1 }],
  accessPoints: [
    { point: { latitude: 25.7, longitude: -100.3 }, distance: 0 },
    { point: { latitude: 25.71, longitude: -100.31 }, distance: 550 },
  ],
};
assert.ok(validRouteAlternatives([road]));
assert.equal(validRouteAlternatives([{ ...road, distance: -1 }]), false);
assert.equal(
  validRouteAlternatives([{ ...road, tollways: [{ start: 0, end: 99, value: 1 }] }]),
  false,
);
assert.equal(
  validRouteAlternatives([
    { ...road, accessPoints: [{ point: { latitude: 999, longitude: 0 }, distance: 0 }] },
  ]),
  false,
);
assert.equal(validRouteAlternatives([]), false);
console.log('Road alternatives and snapping validation PASS');

const { catalogTollRequest, validCatalogQuote, googleMapsRouteUrl } =
  await import('../src/routes/routePlan.js');
const catalogRoute = {
  ...road,
  geometry: {
    type: 'LineString',
    coordinates: [
      [-100.3, 25.7],
      [-100.2, 25.8],
    ],
  },
  tollways: [{ start: 0, end: 1, value: 1 }],
};
assert.equal(catalogTollRequest(catalogRoute, 'car', 2, 0).geometry, catalogRoute.geometry);
assert.equal(catalogTollRequest(catalogRoute, 'car', 3, 0), null);
const partial = {
  currency: 'MXN',
  total: null,
  knownTotal: 63,
  complete: false,
  pendingSections: 1,
  charges: [
    {
      description: 'Demo',
      amount: 63,
      point: { latitude: 25.7, longitude: -100.3 },
      tariffDate: '2025-01-01',
    },
  ],
  edition: '2025',
  source: 'https://www.inegi.org.mx/',
  calculatedAt: '2026-10-09T00:00:00Z',
};
assert.ok(validCatalogQuote(partial));
assert.ok(
  validCatalogQuote({
    ...partial,
    charges: [{ ...partial.charges[0], amount: null }],
    knownTotal: 0,
  }),
);
assert.equal(validCatalogQuote({ ...partial, complete: true, total: 63 }), false);
assert.equal(validCatalogQuote({ ...partial, knownTotal: 64 }), false);
assert.equal(validCatalogQuote({ ...partial, total: 0 }), false);
const mapsUrl = new URL(
  googleMapsRouteUrl({ ...mexico, waypoints: [{ latitude: 25.71, longitude: -100.31 }] }),
);
assert.equal(mapsUrl.searchParams.get('origin'), '25.7,-100.3');
assert.equal(mapsUrl.searchParams.get('waypoints'), '25.71,-100.31');
assert.equal(googleMapsRouteUrl({ ...mexico, waypoints: Array(4).fill(waypoints[0]) }), null);
console.log('Actual-route toll quote, partial budget and Maps link PASS');
