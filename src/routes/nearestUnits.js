import { LngLat } from 'maplibre-gl';
import { routePoint } from './routePlan.js';

export const nearestUnits = (devices, positions, target, now) => {
  const point = routePoint(target);
  if (!point || !Number.isFinite(now)) return [];
  const destination = new LngLat(point.longitude, point.latitude);
  return Object.values(devices)
    .flatMap((device) => {
      const position = positions[device.id];
      const age = now - Date.parse(position?.fixTime);
      if (
        !position ||
        position.deviceId !== device.id ||
        position.valid !== true ||
        !Number.isFinite(position.latitude) ||
        !Number.isFinite(position.longitude) ||
        !routePoint(position) ||
        !Number.isFinite(age) ||
        age < 0 ||
        age > 300000
      )
        return [];
      const distance =
        position.longitude === point.longitude && position.latitude === point.latitude
          ? 0
          : new LngLat(position.longitude, position.latitude).distanceTo(destination);
      return [{ device, position, distance }];
    })
    .sort((a, b) => a.distance - b.distance || a.device.id - b.device.id);
};
