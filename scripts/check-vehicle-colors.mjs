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
assert.deepEqual(
  vehicleColors.map(({ id }) => id),
  ['white', 'grey', 'black', 'blue', 'orange', 'yellow', 'red'],
);
assert.equal(vehicleColor('red'), 'red');
// Missing translations for new categories must not prevent editing a device.
const devicePage = await readFile('src/settings/DevicePage.jsx', 'utf8');
const categoryOptions = devicePage
  .slice(
    devicePage.indexOf('data={deviceCategories') + 'data={'.length,
    devicePage.indexOf("label={t('deviceCategory')}"),
  )
  .trim()
  .replace(/\}$/, '');
const french = JSON.parse(await readFile('src/resources/l10n/fr.json', 'utf8'));
const options = runInNewContext(categoryOptions, { deviceCategories, t: (key) => french[key] });
assert.equal(options.length, deviceCategories.length);
assert.ok(options.every(({ name }) => typeof name === 'string' && name.length));
assert.equal(options.find(({ id }) => id === 'backhoe').name, 'backhoe');
const hsv = (hex) => {
  const [r, g, b] = hex
    .slice(1)
    .match(/../g)
    .map((channel) => parseInt(channel, 16));
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const hue =
    delta === 0
      ? 0
      : max === r
        ? (g - b) / delta
        : max === g
          ? (b - r) / delta + 2
          : (r - g) / delta + 4;
  return {
    r,
    g,
    b,
    hue: (hue * 60 + 360) % 360,
    saturation: max === 0 ? 0 : delta / max,
    value: max / 255,
  };
};
for (const [id, minimumHue, maximumHue, minimumSaturation] of [
  ['blue', 220, 245, 0.65],
  ['yellow', 37, 55, 0.75],
  ['red', 345, 365, 0.7],
]) {
  const color = vehicleColors.find((color) => color.id === id);
  for (const hex of [color.hex, ...color.shades]) {
    const { hue, saturation } = hsv(hex);
    const wrappedHue = id === 'red' && hue < 180 ? hue + 360 : hue;
    assert.ok(
      wrappedHue >= minimumHue && wrappedHue <= maximumHue,
      `${id} hue stays recognizable: ${hex}`,
    );
    assert.ok(saturation >= minimumSaturation, `${id} body shades stay saturated: ${hex}`);
  }
}
const blue = hsv(vehicleColors.find(({ id }) => id === 'blue').hex);
assert.ok(blue.b >= 180 && blue.r < 70 && blue.g < 110, 'Royal blue stays strong rather than cyan');
const yellow = hsv(vehicleColors.find(({ id }) => id === 'yellow').hex);
assert.ok(
  yellow.r >= 220 && yellow.g >= 160 && yellow.g < 215 && yellow.b < 30,
  'Yellow stays golden rather than pale or lemon',
);
const red = hsv(vehicleColors.find(({ id }) => id === 'red').hex);
assert.ok(
  red.value >= 0.85 && red.r > red.g * 3 && red.b >= red.g,
  'Red stays vivid and never shifts toward orange',
);
for (const id of ['blue', 'orange', 'yellow', 'red']) {
  const { shades } = vehicleColors.find((color) => color.id === id);
  assert.ok(hsv(shades[1]).value >= 0.9, `${id} main body stays bright`);
  assert.ok(hsv(shades[3]).value >= 0.8, `${id} shaded body stays visible`);
}
for (const invalid of [undefined, null, '', 'pink', '<script>', {}])
  assert.equal(vehicleColor(invalid), 'white');
for (const name of [
  'car',
  'truck-tractor',
  'pickup',
  'bus',
  'truck',
  'van',
  'trailer',
  'dump-truck',
  'camper',
  'crane',
  'tractor',
  'motorcycle',
  'backhoe',
  'bicycle',
  'scooter',
  'boat',
  'ship',
  'helicopter',
  'plane',
  'train',
  'tram',
]) {
  const svg = await readFile(`src/resources/images/categories/${name}.svg`, 'utf8');
  const variants = vehicleColors.map(({ id }) => colorizeVehicleSvg(svg, id));
  assert.equal(new Set(variants).size, vehicleColors.length);
  assert.equal(colorizeVehicleSvg(svg, 'unknown'), colorizeVehicleSvg(svg, 'white'));
  for (const variant of variants) {
    assert.ok(variant.includes('viewBox="0 0 96 96"'));
    assert.match(variant, /stroke="#(?:193c58|183b5b|91a0ac)"/, 'Preserve outlines');
    assert.ok(variant.includes('#e8f8ff') || variant.includes('#effaff'), 'Preserve highlights');
    assert.ok(!variant.includes('<script'));
  }
}
console.log(
  'Seven ordered vehicle colors, vivid blue/golden yellow/red, safe fallback, body-only recoloring and SVG proportions OK',
);
