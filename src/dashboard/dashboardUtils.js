export const classifyPosition = (position, now) => {
  const age = now - Date.parse(position?.fixTime);
  if (
    !position ||
    position.valid !== true ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > 15 * 60000
  ) {
    return 'stale';
  }
  const motion = position.attributes?.motion;
  return typeof motion === 'boolean' ? (motion ? 'moving' : 'stopped') : 'unknown';
};

// The summary endpoint is requested with daily=false: one result per unit.
export const summarizeActivity = (items, devices) => {
  const total = { count: 0, distance: 0, engineHours: 0, distanceCount: 0, hoursCount: 0 };
  const seen = new Set();
  items.forEach((item) => {
    if (!devices[item.deviceId] || seen.has(item.deviceId)) return;
    seen.add(item.deviceId);
    total.count += 1;
    if (Number.isFinite(item.distance) && item.distance >= 0) {
      total.distance += item.distance;
      total.distanceCount += 1;
    }
    if (Number.isFinite(item.engineHours) && item.engineHours > 0) {
      total.engineHours += item.engineHours;
      total.hoursCount += 1;
    }
  });
  return total;
};
