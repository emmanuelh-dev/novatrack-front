/* global console */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import deviceCategories from '../src/common/util/deviceCategories.js';
import {
  vehicleColors,
  vehicleColor,
  colorizeVehicleSvg,
} from '../src/common/util/vehicleColors.js';

const preload = await readFile('src/map/core/preloadImages.js', 'utf8');
const svgBindings = Object.fromEntries(
  [...preload.matchAll(/^import (\w+) from '[^']+\.svg[^']*';$/gm)].map(([, name]) => [
    name,
    name.endsWith('Source')
      ? `<svg data-asset="${name}"><path fill="#3d9be5" /></svg>`
      : `/synthetic/${name}.svg`,
  ]),
);
const icons = runInNewContext(
  `${preload
    .slice(preload.indexOf('export const mapIcons ='), preload.indexOf('export const eventIcons ='))
    .replaceAll('export const ', 'const ')}
  ({ mapIcons, mapIconKey, isVehicleIcon, vehicleIconUrl, vehicleImageKey });`,
  { ...svgBindings, vehicleColors, vehicleColor, colorizeVehicleSvg },
);
const vehicleCategories = deviceCategories.filter(
  (category) => !['default', 'animal', 'person', 'dashcam'].includes(category),
);
assert.equal(vehicleCategories.length, 21);
for (const category of vehicleCategories) {
  assert.ok(icons.isVehicleIcon(icons.mapIcons[category]), `Native ${category} SVG rotates`);
  for (const { id } of vehicleColors) {
    const url = icons.vehicleIconUrl(category, id);
    assert.ok(url.startsWith('data:image/svg+xml;'), `${category} ${id} uses the palette`);
    assert.ok(icons.isVehicleIcon(url), `Colored ${category} ${id} SVG rotates`);
    for (const status of ['info', 'success', 'error', 'neutral'])
      assert.equal(
        icons.vehicleImageKey(category, id, status),
        `${category}${id === 'blue' ? '' : `-${id}`}-${status}`,
      );
  }
}
for (const category of ['default', 'animal', 'person', 'dashcam', 'start', 'finish'])
  assert.equal(icons.isVehicleIcon(icons.mapIcons[category]), false);
assert.ok(icons.isVehicleIcon('/synthetic/legacy.png'));
assert.equal(icons.mapIconKey('offroad'), 'car');
assert.equal(icons.mapIconKey('trolleybus'), 'bus');

const devices = Object.fromEntries(
  vehicleCategories.map((category, id) => [
    id,
    { category, name: category, attributes: { vehicleIconColor: vehicleColors[id % 7].id } },
  ]),
);
const positions = vehicleCategories.flatMap((_, deviceId) =>
  [0, 90, 180, 270].map((course, heading) => ({
    id: deviceId * 4 + heading,
    deviceId,
    course,
    latitude: 25,
    longitude: -100,
  })),
);
const positionSource = await readFile('src/map/MapPositionMarkers.jsx', 'utf8');
const markers = runInNewContext(
  `${positionSource.slice(
    positionSource.indexOf('  const buildMarker ='),
    positionSource.indexOf('\n\n  const markers ='),
  )}\npositions.map(buildMarker);`,
  {
    ...icons,
    positions,
    devices,
    directionType: 'all',
    showStatus: false,
    titleField: 'name',
    formatTime: () => '',
  },
);
assert.ok(markers.every((marker) => marker.rotateIcon && !marker.direction));

let configuration;
const source = (await readFile('src/map/MapMarkers.js', 'utf8'))
  .replace(/^import .*;\n/gm, '')
  .replace('export default MapMarkers;', 'MapMarkers(input);');
runInNewContext(source, {
  input: { markers, showTitles: true, direction: true, cluster: true },
  ['useCallback']: (callback) => callback,
  ['useRef']: (current) => ({ current }),
  ['useTheme']: () => ({ breakpoints: { up: () => 'desktop' } }),
  ['useMediaQuery']: () => true,
  ['useAttributePreference']: (_key, fallback) => fallback,
  ['useCatchCallback']: (callback) => callback,
  findFonts: () => ['Noto Sans Regular'],
  toMapCoordinates: (longitude, latitude) => [longitude, latitude],
  map: {},
  ['useMapLayer']: (value) => {
    configuration = value;
  },
});
const native = JSON.parse(JSON.stringify(configuration));
const vehicles = native.layers.find((layer) => layer.key === 'vehicles');
assert.equal(vehicles.layout['icon-rotation-alignment'], 'map');
assert.equal(vehicles.layout['icon-size'], 0.75 * 1.05);
assert.deepEqual(vehicles.layout['text-offset'], [0, -2 * 0.75 * 1.05]);
assert.deepEqual(vehicles.layout['icon-rotate'], ['get', 'rotation']);
assert.deepEqual(vehicles.filter, ['all', ['!has', 'point_count'], ['==', 'rotateIcon', true]]);
assert.equal(native.layers[0].layout['icon-rotate'], undefined);
assert.equal(
  native.layers.find((layer) => layer.key === 'clusters').layout['icon-rotate'],
  undefined,
);
assert.deepEqual(
  native.data.features.map((feature) => feature.properties.rotation),
  positions.map(({ course }) => course),
);
assert.ok(native.data.features.every((feature) => feature.properties.rotateIcon));
console.log(
  'All 21 native/seven-color SVGs recognized; real position markers preserve north/east/south/west, map alignment, legacy and clusters OK',
);
