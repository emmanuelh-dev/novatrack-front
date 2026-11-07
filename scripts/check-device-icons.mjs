/* global process, console, document, innerWidth, window, Image, getComputedStyle, CanvasRenderingContext2D */
// Static build only: synthetic API/WebSocket and no external requests.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { URL } from 'node:url';

import deviceCategories from '../src/common/util/deviceCategories.js';
import {
  vehicleColors,
  vehicleColor,
  colorizeVehicleSvg,
} from '../src/common/util/vehicleColors.js';

const vehicleCategories = deviceCategories.filter(
  (category) => !['default', 'animal', 'person', 'dashcam'].includes(category),
);
assert.equal(vehicleCategories.length, 21);
const vehicleSources = Object.fromEntries(
  await Promise.all(
    vehicleCategories.map(async (category) => {
      const file = category.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
      const svg = await readFile(`src/resources/images/categories/${file}.svg`, 'utf8');
      return [
        category,
        Object.fromEntries(
          vehicleColors.map(({ id }) => [
            id,
            `data:image/svg+xml;charset=utf-8,${encodeURIComponent(colorizeVehicleSvg(svg, id))}`,
          ]),
        ),
      ];
    }),
  ),
);
const expectedSources = Object.values(vehicleSources).flatMap(Object.values);

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.SCREENSHOT_DIR || '/tmp/device-icons-ui';
await mkdir(output, { recursive: true });
const build = resolve(process.env.BUILD_DIR || 'build');
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://127.0.0.1').pathname;
    if (path.startsWith('/api/')) return res.writeHead(503).end();
    const file = resolve(build, '.' + (path === '/' ? '/index.html' : path));
    assert.ok(file.startsWith(build + '/'));
    const types = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.ico': 'image/x-icon',
      '.webmanifest': 'application/manifest+json',
    };
    const body = await readFile(file).catch((error) => {
      if (extname(path)) throw error;
      return readFile(resolve(build, 'index.html'));
    });
    res.setHeader('Content-Type', types[extname(file) || '.html'] || 'application/octet-stream');
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ['--no-sandbox'],
});
const results = [];
try {
  for (const language of ['es', 'en']) {
    const translations = JSON.parse(await readFile(`src/resources/l10n/${language}.json`, 'utf8'));
    const t = (key) => translations[key];
    for (const [width, height, theme] of [
      [1440, 900, 'light'],
      [1440, 900, 'dark'],
      [390, 844, 'light'],
      [390, 844, 'dark'],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height },
        colorScheme: theme,
        deviceScaleFactor: language === 'en' ? 2 : 1,
        serviceWorkers: 'block',
      });
      await context.route('**/*', (route) =>
        new URL(route.request().url()).origin === base ? route.continue() : route.abort(),
      );
      await context.route('**/synthetic-map.json', (route) =>
        route.fulfill({
          json: {
            version: 8,
            sources: {
              roads: {
                type: 'geojson',
                data: {
                  type: 'Feature',
                  properties: {},
                  geometry: {
                    type: 'MultiLineString',
                    coordinates: [
                      [
                        [-99.15, 19.41],
                        [-99.1, 19.46],
                        [-99.08, 19.48],
                      ],
                      [
                        [-99.15, 19.46],
                        [-99.1, 19.41],
                      ],
                    ],
                  },
                },
              },
            },
            glyphs: `${base}/glyphs/{fontstack}/{range}.pbf`,
            layers: [
              {
                id: 'background',
                type: 'background',
                paint: { 'background-color': theme === 'dark' ? '#253342' : '#d4e0dc' },
              },
              {
                id: 'road-edge',
                type: 'line',
                source: 'roads',
                paint: { 'line-color': theme === 'dark' ? '#63717d' : '#bcc5bf', 'line-width': 15 },
              },
              {
                id: 'road',
                type: 'line',
                source: 'roads',
                paint: { 'line-color': theme === 'dark' ? '#3f4e5c' : '#fffaf0', 'line-width': 10 },
              },
            ],
          },
        }),
      );
      await context.route('**/glyphs/**', (route) => route.fulfill({ body: '' }));
      const devices = [
        { id: 1, name: 'Tractocamión demo', category: 'truck' },
        { id: 2, name: 'Dashcam demo', category: 'car' },
        { id: 3, name: 'Retroexcavadora demo', category: 'tractor' },
        { id: 4, name: 'Camión demo', category: 'truck' },
        { id: 5, name: 'Camioneta demo', category: 'pickup' },
        { id: 6, name: 'Remolque demo', category: 'trailer' },
        { id: 7, name: 'Autobús demo', category: 'bus' },
        { id: 8, name: 'Van demo', category: 'van' },
        { id: 9, name: 'Automóvil demo', category: 'car' },
        ...deviceCategories
          .filter(
            (category) =>
              ![
                'default',
                'animal',
                'person',
                'dashcam',
                'backhoe',
                'car',
                'truck',
                'pickup',
                'trailer',
                'bus',
                'van',
                'truckTractor',
              ].includes(category),
          )
          .map((category, index) => ({
            id: index + 10,
            name: `Demo ${category}`,
            category,
          })),
      ].map((device) => ({
        ...device,
        uniqueId: `synthetic-${device.id}`,
        status: device.id === 4 ? 'offline' : device.id === 5 ? 'unknown' : 'online',
        lastUpdate: new Date().toISOString(),
        disabled: false,
        attributes: {
          demoSource: 'retained',
          vehicleIconColor: vehicleColors[(device.id - 1) % vehicleColors.length].id,
          ...(device.id === 3 ? { vehicleIconColor: 'white' } : {}),
        },
      }));
      const saved = [];
      await context.route('**/api/**', (route) => {
        const req = route.request();
        const path = new URL(req.url()).pathname.slice(5);
        let data = [];
        if (req.method() === 'PUT' && /^devices\/[123]$/.test(path)) {
          data = req.postDataJSON();
          const id = Number(path.split('/')[1]);
          assert.equal(data.id, id);
          assert.equal(data.category, { 1: 'truckTractor', 2: 'dashcam', 3: 'backhoe' }[id]);
          assert.equal(
            data.attributes.vehicleIconColor,
            { 1: 'orange', 2: 'black', 3: 'yellow' }[id],
          );
          assert.equal(data.attributes.demoSource, 'retained');
          devices[id - 1] = data;
          saved.push(data.category);
        } else {
          assert.equal(req.method(), 'GET', `Unexpected write: ${path}`);
          if (path === 'server')
            data = {
              id: 1,
              latitude: 19.43,
              longitude: -99.13,
              zoom: 12,
              map: 'custom',
              mapUrl: `${base}/synthetic-map.json`,
              attributes: { language, activeMapStyles: 'custom', mapCluster: false },
            };
          else if (path === 'session')
            data = { id: 1, name: 'Demo', administrator: true, attributes: { language } };
          else if (path === 'devices') data = devices;
          else if (/^devices\/[123]$/.test(path)) data = devices[Number(path.split('/')[1]) - 1];
        }
        return route.fulfill({ json: data });
      });
      let liveSocket;
      await context.routeWebSocket('**/api/socket', (socket) => {
        liveSocket = socket;
        socket.send(
          JSON.stringify({
            positions: devices.map((device) => ({
              id: device.id,
              deviceId: device.id,
              valid: true,
              latitude: 19.43 + (Math.floor((device.id - 1) / 5) - 2) * 0.015,
              longitude: -99.13 + (((device.id - 1) % 5) - 2) * 0.015,
              speed: 0,
              course: (device.id - 1) * 90,
              fixTime: new Date().toISOString(),
              attributes: {},
            })),
          }),
        );
      });
      // Verify that list images also reach the shared map bitmap preparation.
      await context.addInitScript((expectedSources) => {
        const sources = new Set(expectedSources);
        window.iconPaints = {};
        window.vehicleRenders = {};
        window.vehicleRenderChecks = [];
        const draw = CanvasRenderingContext2D.prototype.drawImage;
        const pixels = CanvasRenderingContext2D.prototype.getImageData;
        const hash = async (data) =>
          [...new Uint8Array(await window.crypto.subtle.digest('SHA-256', data))]
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join('');
        CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
          if (image.src) window.iconPaints[image.src] = (window.iconPaints[image.src] || 0) + 1;
          if (sources.has(image.src)) {
            this.vehicleSource = image.src;
            this.vehicleImage = image;
            this.vehicleArguments = args;
            this.vehicleRatio = args[2] / args[3];
            this.originalRatio = image.width / image.height;
          }
          return draw.call(this, image, ...args);
        };
        CanvasRenderingContext2D.prototype.getImageData = function (...args) {
          const result = pixels.call(this, ...args);
          if (this.vehicleSource) {
            const reference = document.createElement('canvas');
            reference.width = this.canvas.width;
            reference.height = this.canvas.height;
            const context = reference.getContext('2d');
            draw.call(context, this.vehicleImage, ...this.vehicleArguments);
            const original = pixels.call(context, ...args);
            let opaquePixels = 0;
            for (let i = 3; i < result.data.length; i += 4)
              if (result.data[i] === 255) opaquePixels += 1;
            const renders = (window.vehicleRenders[this.vehicleSource] ||= []);
            const render = {
              ratio: this.vehicleRatio,
              corners: [
                0,
                result.width - 1,
                result.width * (result.height - 1),
                result.width * result.height - 1,
              ].map((pixel) => result.data[pixel * 4 + 3]),
              opaquePixels,
              original: this.originalRatio,
            };
            renders.push(render);
            window.vehicleRenderChecks.push(
              Promise.all([hash(result.data), hash(original.data)]).then(([bitmap, source]) =>
                Object.assign(render, { bitmap, source }),
              ),
            );
          }
          return result;
        };
      }, expectedSources);
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const profile = `${language}-${width}-${theme}`;
      for (const [id, key] of [
        [1, 'categoryTruckTractor'],
        [2, 'categoryDashcam'],
        [3, 'categoryBackhoe'],
      ]) {
        await page.goto(`${base}/settings/device/${id}`);
        const category = page.getByRole('combobox', { name: t('deviceCategory'), exact: true });
        await category.fill(t(key));
        await page.getByRole('option', { name: t(key), exact: true }).waitFor();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        assert.equal(await category.inputValue(), t(key));
        assert.ok(await category.evaluate((el) => el === document.activeElement));
        const color = page.getByRole('combobox', { name: t('deviceIconColor'), exact: true });
        await color.click();
        for (const { id: key } of vehicleColors)
          await page.getByRole('option', { name: t(`vehicleColor${key}`), exact: true }).waitFor();
        assert.deepEqual(
          await page.getByRole('option').allTextContents(),
          vehicleColors.map(({ id }) => t(`vehicleColor${id}`)),
          'Color options keep the requested order',
        );
        await page.screenshot({
          path: `${output}/${profile}-${id}-colors.png`,
          animations: 'disabled',
        });
        if (id === 2) {
          await page.keyboard.press('Home');
          await page.keyboard.press('ArrowDown');
          await page.keyboard.press('ArrowDown');
          await page.keyboard.press('Enter');
        } else {
          await page
            .getByRole('option', {
              name: t(id === 3 ? 'vehicleColoryellow' : 'vehicleColororange'),
              exact: true,
            })
            .click();
        }
        const categoryBounds = await category.boundingBox();
        const colorBounds = await color.boundingBox();
        assert.ok(
          Math.abs(
            categoryBounds.y + categoryBounds.height / 2 - colorBounds.y - colorBounds.height / 2,
          ) < 5,
          'Color stays beside category',
        );
        await page.screenshot({
          path: `${output}/${profile}-${id}-category.png`,
          animations: 'disabled',
        });
        await page.getByRole('button', { name: t('sharedSave'), exact: true }).click();
        await page.waitForURL((url) => !url.pathname.endsWith(`/device/${id}`));
      }
      assert.deepEqual(saved, ['truckTractor', 'dashcam', 'backhoe']);
      await page.goto(base);
      await page.locator('.maplibregl-canvas').waitFor({ state: 'attached' });
      if (width < 900)
        await page.getByRole('button', { name: t('deviceTitle'), exact: true }).click();
      const icons = [];
      const listedColors = new Set();
      const search = page.getByRole('textbox', { name: t('sharedSearchDevices') });
      for (const device of devices) {
        await search.fill(device.name);
        const row = page.getByRole('button', { name: new RegExp(device.name) });
        const icon = row.locator('img');
        assert.ok(await icon.evaluate((el) => el.complete && el.naturalWidth > 0));
        const src = await icon.getAttribute('src');
        if ((await icon.getAttribute('data-vehicle')) === 'true') {
          assert.equal(await icon.evaluate((el) => getComputedStyle(el).filter), 'none');
          assert.equal(await icon.evaluate((el) => getComputedStyle(el).objectFit), 'contain');
          const color = vehicleColor(device.attributes.vehicleIconColor);
          assert.equal(
            src,
            vehicleSources[device.category][color],
            `${device.category} list color ${color}`,
          );
          listedColors.add(color);
        }
        assert.ok(
          await page.evaluate(
            (src) => window.iconPaints[new URL(src, window.location.href).href] >= 4,
            src,
          ),
        );
        icons.push(src);
      }
      await search.fill('');
      assert.notEqual(icons[0], icons[1]);
      assert.deepEqual([...listedColors].sort(), vehicleColors.map(({ id }) => id).sort());
      await page.waitForFunction(
        (expected) => Object.keys(window.vehicleRenders).length === expected,
        vehicleCategories.length * vehicleColors.length,
        { timeout: 30000 },
      );
      const renders = await page.evaluate(async () => {
        await Promise.all(window.vehicleRenderChecks);
        return window.vehicleRenders;
      });
      assert.equal(
        Object.keys(renders).length,
        vehicleCategories.length * vehicleColors.length,
        'Every vehicle color is prepared',
      );
      for (const source of expectedSources) {
        const variants = renders[source];
        assert.ok(variants, 'Every palette color, including blue, reaches map preparation');
        assert.equal(variants.length, 4, 'All four status bitmaps are prepared');
        assert.ok(
          variants.every((it) => Math.abs(it.ratio - it.original) < 0.001),
          'Preserve vehicle proportions',
        );
        assert.ok(
          variants.every((it) => it.corners.every((alpha) => alpha === 0)),
          'Vehicle bitmap corners stay transparent',
        );
        assert.equal(
          new Set(variants.map((it) => it.bitmap)).size,
          1,
          'Vehicle pixels are identical across all four statuses',
        );
        assert.ok(
          variants.every((it) => it.bitmap === it.source),
          'Vehicle pixels match the source with no status dot or overlay',
        );
        assert.ok(
          variants.every((it) => it.opaquePixels > 0),
          'Vehicle body retains opaque pixels',
        );
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `${output}/${profile}-list.png`, animations: 'disabled' });
      if (width < 900)
        await page.getByLabel(t('mapTitle'), { exact: true }).and(page.getByRole('button')).click();
      await page.locator('.maplibregl-ctrl-scale').waitFor({ state: 'visible' });
      const canvas = await page.locator('.maplibregl-canvas').boundingBox();
      assert.ok(
        canvas.width >= width - 1 && canvas.height >= height - 200,
        `Map leaves room for the mobile header and menu: ${JSON.stringify(canvas)}`,
      );
      assert.ok(liveSocket);
      liveSocket.send(
        JSON.stringify({
          positions: devices.map((device) => ({
            id: device.id,
            deviceId: device.id,
            valid: true,
            latitude: 19.43 + (Math.floor((device.id - 1) / 5) - 2) * 0.015,
            longitude: -99.13 + (((device.id - 1) % 5) - 2) * 0.015,
            speed: 0,
            course: (device.id - 1) * 90,
            fixTime: new Date().toISOString(),
            attributes: {},
          })),
        }),
      );
      await page.waitForLoadState('networkidle');
      let visibleColors = [];
      const palette = vehicleColors.map(({ id, hex, shades }) => ({
        id,
        rgb: [hex, ...shades.slice(1, 4)].map((value) =>
          value
            .slice(1)
            .match(/../g)
            .map((channel) => parseInt(channel, 16)),
        ),
      }));
      for (
        let attempt = 0;
        attempt < 10 && visibleColors.length < vehicleColors.length;
        attempt += 1
      ) {
        const bitmap = await page.locator('.maplibregl-canvas').screenshot();
        visibleColors = await page.evaluate(
          async ({ encoded, palette }) => {
            const image = new Image();
            image.src = `data:image/png;base64,${encoded}`;
            await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0);
            const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            return palette
              .filter(({ rgb }) => {
                let count = 0;
                for (let i = 0; i < pixels.length; i += 4)
                  if (
                    rgb.some((color) =>
                      color.every((value, channel) => Math.abs(pixels[i + channel] - value) < 12),
                    )
                  )
                    count += 1;
                return count > 3;
              })
              .map(({ id }) => id);
          },
          { encoded: bitmap.toString('base64'), palette },
        );
        if (visibleColors.length < vehicleColors.length) await page.waitForTimeout(200);
      }
      assert.deepEqual(
        visibleColors,
        vehicleColors.map(({ id }) => id),
        'Map actually renders the vehicle palette',
      );
      await page.locator('.maplibregl-ctrl-zoom-in').click();
      await page.locator('.maplibregl-ctrl-zoom-in').click();
      await page.waitForTimeout(700); // Let the native map zoom animation finish before inspection.
      await page.screenshot({ path: `${output}/${profile}-map.png`, animations: 'disabled' });
      assert.deepEqual(errors, []);
      results.push({
        language,
        width,
        theme,
        mapCanvas: canvas,
        passed: [
          'categories and per-device colors saved with other attributes preserved',
          'localized labels',
          'keyboard selection',
          'colored vehicle icons in list with original proportions',
          'all 21 vehicle types and seven colors have four identical map status bitmaps without overlays',
          'all seven colors, including blue, appear in list and map',
          'no page overflow',
        ],
      });
      await context.close();
    }
  }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
