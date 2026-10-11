const timestamp = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(T|$)/.test(value)) return null;
  const result = Date.parse(value);
  const calendarDate = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(result) &&
    Number.isFinite(calendarDate.getTime()) &&
    calendarDate.toISOString().slice(0, 10) === value.slice(0, 10)
    ? result
    : null;
};

export const tripMetrics = (order, now = Date.now()) => {
  const trip = order.attributes.routeTrip;
  const plannedDeparture = timestamp(trip.request?.departureTime);
  const plannedArrival = timestamp(trip.plannedArrival);
  const actualTime = (value) => {
    const time = timestamp(value);
    return time !== null && time <= now ? time : null;
  };
  const actualStart = actualTime(trip.startedTime);
  let actualArrival = actualTime(trip.arrivedTime);
  if (actualStart !== null && actualArrival !== null && actualArrival < actualStart)
    actualArrival = null;
  const cancelled = trip.status === 'cancelled';
  const arrivalDelta =
    !cancelled && actualArrival !== null && plannedArrival !== null
      ? actualArrival - plannedArrival
      : null;
  return {
    plannedDeparture,
    plannedArrival,
    actualStart,
    actualArrival,
    duration: actualStart !== null && actualArrival !== null ? actualArrival - actualStart : null,
    startDelta:
      !cancelled && actualStart !== null && plannedDeparture !== null
        ? actualStart - plannedDeparture
        : null,
    arrivalDelta,
    arrived: !cancelled && actualArrival !== null,
    late: arrivalDelta !== null && arrivalDelta > 0,
  };
};

export const tripVisits = (order, now = Date.now()) => {
  const trip = order.attributes.routeTrip;
  const actualTime = (value) => {
    const time = timestamp(value);
    return time !== null && time <= now ? time : null;
  };
  const start = actualTime(trip.startedTime);
  return [
    ...(trip.stops || []),
    { place: trip.destination, arrivedTime: trip.arrivedTime, visit: trip.destinationVisit },
  ].map(({ place, arrivedTime, visit: inlineVisit }, index) => {
    const destination = index === (trip.stops || []).length;
    const visit =
      inlineVisit ?? order.attributes.routeVisits?.[destination ? 'destination' : String(index)];
    const arrival = actualTime(arrivedTime);
    const departure = actualTime(visit?.departedTime);
    const lastInside = actualTime(visit?.lastInsideTime);
    const ongoing = ['active', 'arrived'].includes(trip.status);
    let state = 'pending';
    let duration = null;
    if (arrival !== null) {
      if (start !== null && arrival < start) {
        state = 'incomplete';
      } else if (!visit) {
        state = 'unrecorded';
      } else if (
        visit.uncertain ||
        lastInside === null ||
        lastInside < arrival ||
        (visit.departedTime != null && (departure === null || departure < lastInside)) ||
        (departure === null && (!ongoing || now - lastInside > 300000))
      ) {
        state = 'incomplete';
      } else {
        state = departure === null ? 'inside' : 'departed';
        duration = (departure ?? lastInside) - arrival;
      }
    } else if (arrivedTime != null || visit) {
      state = 'incomplete';
    }
    return {
      index,
      destination,
      place,
      arrival,
      departure,
      lastInside,
      duration,
      state,
    };
  });
};

export const filterTrips = (orders, { from, to, deviceId = '', status = '' }, devices) => {
  const start = timestamp(from);
  const end = timestamp(to);
  if (start === null || end === null || start > end) return [];
  return orders.filter((order) => {
    const trip = order.attributes?.routeTrip;
    if (trip?.version !== 1) return false;
    if (devices && !Object.hasOwn(devices, trip.deviceId)) return false;
    const departure = timestamp(trip.request?.departureTime);
    return (
      departure !== null &&
      departure >= start &&
      departure <= end &&
      (!deviceId || String(trip.deviceId) === String(deviceId)) &&
      (!status || trip.status === status)
    );
  });
};
