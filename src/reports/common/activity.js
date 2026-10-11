export const activityTotals = (items) => {
  const totals = {
    observedMillis: 0,
    stoppedMillis: 0,
    idleMillis: 0,
    ignitionUnknownMillis: 0,
    motionUnknownMillis: 0,
    uncoveredMillis: 0,
    positionCount: 0,
    outsidePlacesMillis: null,
  };
  items.forEach((item) => {
    Object.keys(totals).forEach((key) => {
      if (key !== 'outsidePlacesMillis') {
        totals[key] += item[key];
      }
    });
  });
  if (items.length && items.every((item) => item.outsidePlacesMillis != null)) {
    totals.outsidePlacesMillis = items.reduce((total, item) => total + item.outsidePlacesMillis, 0);
  }
  return totals;
};

export const activityQuery = ({ from, to, deviceIds, groupIds, geofenceIds }) => {
  const query = new URLSearchParams({ from, to });
  deviceIds.filter((id) => id !== 'all').forEach((id) => query.append('deviceId', id));
  groupIds.forEach((id) => query.append('groupId', id));
  geofenceIds.forEach((id) => query.append('geofenceId', id));
  return query;
};
