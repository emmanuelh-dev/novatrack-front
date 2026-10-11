import { parse } from 'wellknown';

const number = (value, min, max) => {
  if (!['string', 'number'].includes(typeof value) || String(value).trim() === '') return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= min && result <= max ? result : null;
};

export const routePoint = (point) => {
  const latitude = number(point?.latitude, -90, 90);
  const longitude = number(point?.longitude, -180, 180);
  return latitude === null || longitude === null ? null : { latitude, longitude };
};

export const placePoint = (item) => {
  const circle = item?.area?.match(/^CIRCLE\s*\(([^,]+),\s*([^()]+)\)$/);
  if (circle) {
    const [latitude, longitude, extra] = circle[1].trim().split(/\s+/);
    return extra || number(circle[2], 10, 50000) === null
      ? null
      : routePoint({ latitude, longitude });
  }
  const polygon = item?.area && parse(item.area);
  if (polygon?.type !== 'Polygon' || polygon.coordinates.length !== 1) return null;
  const points = polygon.coordinates[0];
  if (
    points.length < 4 ||
    points.some(([latitude, longitude]) => !routePoint({ latitude, longitude }))
  )
    return null;
  // ponytail: same bounds midpoint as TripService; visits depend on the zone, not this routing point.
  return {
    latitude:
      (Math.min(...points.map(([lat]) => lat)) + Math.max(...points.map(([lat]) => lat))) / 2,
    longitude:
      (Math.min(...points.map(([, lon]) => lon)) + Math.max(...points.map(([, lon]) => lon))) / 2,
  };
};

export const routeRequest = (plan) => {
  const origin = routePoint(plan?.origin);
  const destination = routePoint(plan?.destination);
  if (!origin || !destination || !['car', 'truck'].includes(plan.profile)) return null;
  if (origin.latitude === destination.latitude && origin.longitude === destination.longitude)
    return null;
  if (
    plan.waypoints !== undefined &&
    (!Array.isArray(plan.waypoints) || plan.waypoints.length > 10)
  )
    return null;
  const waypoints = (plan.waypoints || []).map(routePoint);
  if (waypoints.includes(null)) return null;
  const points = [origin, ...waypoints, destination];
  if (
    points.some(
      (point, index) =>
        index > 0 &&
        point.latitude === points[index - 1].latitude &&
        point.longitude === points[index - 1].longitude,
    )
  )
    return null;
  const result = { origin, destination, profile: plan.profile };
  if (waypoints.length) result.waypoints = waypoints;
  if (plan.departureTime) {
    const date = new Date(plan.departureTime);
    if (!Number.isFinite(date.getTime())) return null;
    result.departureTime = date.toISOString();
  }
  if (plan.profile === 'truck') {
    const truck = Object.fromEntries(
      ['height', 'width', 'length', 'weight', 'axleload'].map((key) => [
        key,
        number(plan.truck?.[key], 0.1, { height: 10, width: 10, length: 100 }[key] || 1000),
      ]),
    );
    if (Object.values(truck).includes(null) || truck.axleload > truck.weight) return null;
    result.truck = truck;
  }
  return result;
};

export const savedRoute = (order) => {
  const plan = order?.attributes?.routePlan;
  return plan?.version === 1 ? routeRequest(plan) : null;
};

export const tollRequest = (plan, axles, extraAxles, preference) => {
  const origin = routePoint(plan?.origin);
  const destination = routePoint(plan?.destination);
  const base = number(axles, 2, plan?.profile === 'car' ? 2 : 9);
  const extra = number(extraAxles, 0, 5);
  if (
    !origin ||
    !destination ||
    !['car', 'truck'].includes(plan.profile) ||
    !Number.isInteger(base) ||
    !Number.isInteger(extra) ||
    !['optimal', 'toll', 'free'].includes(preference) ||
    (plan.waypoints !== undefined &&
      (!Array.isArray(plan.waypoints) || plan.waypoints.length !== 0)) ||
    (origin.latitude === destination.latitude && origin.longitude === destination.longitude) ||
    [origin, destination].some(
      (point) =>
        point.latitude < 14 ||
        point.latitude > 33 ||
        point.longitude < -119 ||
        point.longitude > -86,
    )
  )
    return null;
  return { origin, destination, profile: plan.profile, axles: base, extraAxles: extra, preference };
};

export const validTollQuote = (quote) =>
  quote?.currency === 'MXN' &&
  Number.isFinite(quote.total) &&
  quote.total >= 0 &&
  typeof quote.source === 'string' &&
  quote.source.trim() !== '' &&
  Number.isFinite(Date.parse(quote.calculatedAt)) &&
  quote.route?.provider === 'inegi-sakbe' &&
  quote.route.geometry?.type === 'LineString' &&
  Array.isArray(quote.route.geometry.coordinates) &&
  quote.route.geometry.coordinates.length >= 2 &&
  quote.route.geometry.coordinates.every(
    (xy) =>
      Array.isArray(xy) && xy.length === 2 && routePoint({ longitude: xy[0], latitude: xy[1] }),
  ) &&
  Number.isFinite(quote.route.distance) &&
  quote.route.distance > 0 &&
  Number.isFinite(quote.route.duration) &&
  quote.route.duration > 0 &&
  Array.isArray(quote.charges) &&
  quote.charges.every(
    (charge) =>
      Number.isFinite(charge?.amount) &&
      typeof charge?.description === 'string' &&
      (charge.point == null || Boolean(routePoint(charge.point))),
  ) &&
  Math.abs(quote.charges.reduce((sum, charge) => sum + charge.amount, 0) - quote.total) < 0.011;

export const validRouteAlternatives = (routes) =>
  Array.isArray(routes) &&
  routes.length > 0 &&
  routes.length <= 6 &&
  routes.every((route) => {
    const points = route?.geometry?.coordinates;
    if (
      route?.geometry?.type !== 'LineString' ||
      !Array.isArray(points) ||
      points.length < 2 ||
      points.length > 100000 ||
      !points.every(
        (xy) =>
          Array.isArray(xy) && xy.length === 2 && routePoint({ longitude: xy[0], latitude: xy[1] }),
      ) ||
      !Number.isFinite(route.distance) ||
      route.distance <= 0 ||
      !Number.isFinite(route.duration) ||
      route.duration <= 0 ||
      !Number.isFinite(Date.parse(route.arrivalTime))
    )
      return false;
    if (
      route.accessPoints != null &&
      (!Array.isArray(route.accessPoints) ||
        !route.accessPoints.every(
          (item) =>
            routePoint(item?.point) &&
            Number.isFinite(item.distance) &&
            item.distance >= 0 &&
            item.distance <= 1000,
        ))
    )
      return false;
    if (route.tollways == null) return true;
    let end = 0;
    if (!Array.isArray(route.tollways) || route.tollways.length === 0) return false;
    for (const section of route.tollways) {
      if (
        !Number.isInteger(section?.start) ||
        section.start !== end ||
        !Number.isInteger(section.end) ||
        section.end <= end ||
        section.end >= points.length ||
        ![0, 1].includes(section.value)
      )
        return false;
      end = section.end;
    }
    return end === points.length - 1;
  });

export const catalogTollRequest = (route, profile, axles, extraAxles) => {
  if (
    !route ||
    !validRouteAlternatives([route]) ||
    !['car', 'truck'].includes(profile) ||
    !Number.isInteger(axles) ||
    axles < 2 ||
    axles > 9 ||
    (profile === 'car' && axles !== 2) ||
    !Number.isInteger(extraAxles) ||
    extraAxles < 0 ||
    extraAxles > 5
  )
    return null;
  return { geometry: route.geometry, tollways: route.tollways ?? null, profile, axles, extraAxles };
};

export const validCatalogQuote = (quote) =>
  quote?.currency === 'MXN' &&
  typeof quote.complete === 'boolean' &&
  Number.isFinite(quote.knownTotal) &&
  quote.knownTotal >= 0 &&
  Number.isInteger(quote.pendingSections) &&
  quote.pendingSections >= 0 &&
  typeof quote.source === 'string' &&
  quote.source.startsWith('https://') &&
  typeof quote.edition === 'string' &&
  quote.edition.length > 0 &&
  Number.isFinite(Date.parse(quote.calculatedAt)) &&
  Array.isArray(quote.charges) &&
  quote.charges.length <= 10000 &&
  quote.charges.every(
    (charge) =>
      typeof charge?.description === 'string' &&
      Boolean(routePoint(charge.point)) &&
      (charge.amount === null || (Number.isFinite(charge.amount) && charge.amount >= 0)),
  ) &&
  Math.abs(
    quote.charges.reduce((sum, charge) => sum + (charge.amount ?? 0), 0) - quote.knownTotal,
  ) < 0.011 &&
  (quote.complete
    ? quote.pendingSections === 0 &&
      quote.charges.every((charge) => charge.amount !== null) &&
      Number.isFinite(quote.total) &&
      Math.abs(quote.total - quote.knownTotal) < 0.011
    : quote.total === null &&
      (quote.pendingSections > 0 || quote.charges.some((charge) => charge.amount === null)));

export const googleMapsRouteUrl = (plan) => {
  const points = [plan?.origin, ...(plan?.waypoints || []), plan?.destination].map(routePoint);
  // Maps URLs support at most three intermediate stops on mobile browsers.
  if (points.some((point) => !point) || points.length > 5) return null;
  const coordinate = (point) => `${point.latitude},${point.longitude}`;
  const query = new URLSearchParams({
    api: '1',
    origin: coordinate(points[0]),
    destination: coordinate(points.at(-1)),
    travelmode: 'driving',
  });
  if (points.length > 2) query.set('waypoints', points.slice(1, -1).map(coordinate).join('|'));
  return `https://www.google.com/maps/dir/?${query}`;
};
