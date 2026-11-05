/* global process, console, URL, document, innerWidth */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
const tileCache = new Map();
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:18767';
const output = process.env.SCREENSHOT_DIR || '/tmp/anacondda-routing-ui';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  headless: true,
  args: ['--no-sandbox'],
});
const user = {
  id: 1,
  name: 'Operador demo',
  email: 'routing@example.test',
  administrator: false,
  attributes: { language: 'es', distanceUnit: 'km' },
};
const devices = [
  { id: 1, name: 'Unidad 01 · Reparto', uniqueId: 'demo', status: 'online', attributes: {} },
];
const position = {
  id: 1,
  deviceId: 1,
  latitude: 19.43,
  longitude: -99.13,
  valid: true,
  fixTime: '2026-10-06T14:00:00Z',
  attributes: {},
};
const results = [];
try {
  for (const [theme, width, height] of [
    ['light', 1440, 900],
    ['dark', 1440, 900],
    ['light', 390, 844],
    ['dark', 390, 844],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      colorScheme: theme,
      serviceWorkers: 'block',
      timezoneId: 'America/Tijuana',
    });
    console.log('Checking', theme, width);
    let slowStarted;
    let tiles = 0,
      pendingTiles = 0;
    await context.route('https://tile.openstreetmap.de/**', async (route) => {
      pendingTiles++;
      const url = route.request().url();
      if (!tileCache.has(url))
        tileCache.set(
          url,
          run('curl', ['--fail', '--silent', '--max-time', '15', url], { encoding: 'buffer' }),
        );
      try {
        const { stdout } = await tileCache.get(url);
        await route.fulfill({ contentType: 'image/png', body: stdout });
        tiles++;
      } catch {
        await route.abort();
      } finally {
        pendingTiles--;
      }
    });
    let orders = [],
      mode = 'ok',
      callCount = 0,
      writes = 0,
      readonly = false,
      release;
    await context.route('**/api/**', async (route) => {
      const request = route.request(),
        url = new URL(request.url()),
        path = url.pathname.slice(5),
        method = request.method();
      if (path === 'routing' || path === 'routing/alternatives') {
        callCount++;
        const input = request.postDataJSON();
        if (mode === 'slow')
          await new Promise((resolve) => {
            release = resolve;
            slowStarted?.();
          });
        if (mode === 'error') return route.fulfill({ status: 422, json: { code: 'NO_ROUTE' } });
        const result = {
          geometry: {
            type: 'LineString',
            coordinates: [
              [input.origin.longitude, input.origin.latitude],
              [-99.135, 19.435],
              [input.destination.longitude, input.destination.latitude],
            ],
          },
          distance: 2100.5,
          duration: 300.5,
          departureTime: '2026-10-08T14:00:00Z',
          arrivalTime: '2026-10-08T14:05:00.500Z',
          traffic: false,
          attribution: '© openrouteservice | © OpenStreetMap contributors',
        };
        return route.fulfill({ json: path === 'routing/alternatives' ? [result] : result });
      }
      if (path.startsWith('orders') && method !== 'GET') {
        writes++;
        assert.equal(readonly, false, 'readonly wrote an order');
        if (method === 'DELETE') {
          orders = [];
          return route.fulfill({ status: 204 });
        }
        const saved = { ...request.postDataJSON(), id: 1 };
        orders = [saved];
        return route.fulfill({ json: saved });
      }
      let json = [];
      if (path === 'server')
        json = {
          id: 1,
          version: 'synthetic',
          routingEnabled: true,
          latitude: 19.43,
          longitude: -99.13,
          zoom: 12,
          map: 'custom',
          mapUrl: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png',
          attributes: { language: 'es', activeMapStyles: 'custom' },
        };
      else if (path === 'session') json = { ...user, readonly };
      else if (path === 'devices') json = devices;
      else if (path === 'positions') json = [position];
      else if (path === 'orders') json = orders;
      return route.fulfill({ json });
    });
    await context.routeWebSocket('**/api/socket', (socket) => {
      socket.onMessage(() => {});
      socket.send(JSON.stringify({ devices, positions: [position] }));
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.setDefaultTimeout(12000);
    await page.goto(`${base}/routes`);
    await page.getByRole('tab', { name: 'Calcular', exact: true }).click();
    await page.getByRole('heading', { name: 'Planificador de rutas' }).waitFor();
    assert.equal(await page.locator('.MuiBottomNavigation-root').count(), 1, 'one navigation bar');
    if (width >= 900) {
      const sidebar = page.locator('section');
      assert.equal(await sidebar.locator('.MuiBottomNavigation-root').count(), 1);
      const bounds = await sidebar.boundingBox();
      const nav = await page.locator('.MuiBottomNavigation-root').boundingBox();
      assert.ok(Math.abs(bounds.width - nav.width) < 2 && bounds.width < width / 2);
    }
    if (width < 600) await page.getByRole('button', { name: 'Mapa', exact: true }).first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${output}/${width}-${theme}-monterrey.png` });
    await page.locator('.maplibregl-canvas').click({ position: { x: 170, y: 180 } });
    await page.locator('.maplibregl-canvas').click({ position: { x: 200, y: 210 } });
    if (width < 600) await page.getByRole('button', { name: 'Datos de ruta', exact: true }).click();
    const lat = page.getByLabel('Latitud', { exact: true }),
      lon = page.getByLabel('Longitud', { exact: true });
    assert.ok(
      Math.abs(Number(await lat.nth(0).inputValue()) - 25.6866) < 0.5,
      'Monterrey latitude',
    );
    assert.ok(
      Math.abs(Number(await lon.nth(0).inputValue()) + 100.3161) < 0.5,
      'Monterrey longitude',
    );
    assert.notEqual(await lat.nth(1).inputValue(), '');
    assert.equal(await page.getByLabel('Usar una unidad como origen', { exact: true }).count(), 0);
    assert.equal(await lat.nth(0).isVisible(), false);
    await page.getByRole('button', { name: 'Opciones de ruta', exact: true }).click();
    await lat.nth(0).fill('19.43');
    await lon.nth(0).fill('-99.13');
    await lat.nth(1).fill('19.44');
    await lon.nth(1).fill('-99.14');
    await page.getByLabel('Nombre', { exact: true }).fill('CDMX · Entrega Centro');
    await page.getByRole('button', { name: 'Calcular ruta', exact: true }).click();
    await page
      .getByText(/2\.10 km/i)
      .first()
      .waitFor({ state: 'attached' });
    await page.waitForFunction(() => {
      const markers = [...document.querySelectorAll('.maplibregl-marker')];
      return (
        markers.length === 2 &&
        Math.abs(markers[0].getBoundingClientRect().x - markers[1].getBoundingClientRect().x) > 40
      );
    });
    await page.waitForTimeout(300);
    for (let attempt = 0; attempt < 40 && (!tiles || pendingTiles); attempt++)
      await page.waitForTimeout(250);
    assert.ok(tiles, 'base map tiles loaded');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${output}/route-${theme}-${width}.png`, fullPage: true });
    console.log('Capture', theme, width);
    if (width < 600) await page.getByRole('button', { name: 'Datos de ruta', exact: true }).click();
    if (width < 600)
      await page.screenshot({ path: `${output}/form-${theme}-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await page.getByText('Ruta guardada.', { exact: true }).waitFor();
    assert.equal(orders[0].attributes.routePlan.version, 1);
    assert.equal(orders[0].attributes.routePlan.profile, 'car');
    assert.equal(orders[0].attributes.routePlan.geometry, undefined);
    orders[0].attributes.foreignAttribute = 'preserved';
    orders[0].attributes.routePlan.departureTime = '2026-11-01T09:30:12.345Z';
    await page.reload();
    await page.getByRole('tab', { name: 'Calcular', exact: true }).click();
    const beforeOpen = callCount;
    await page.getByRole('button', { name: 'Opciones de ruta', exact: true }).click();
    await page.getByLabel('Rutas guardadas').click();
    await page.getByRole('option', { name: 'CDMX · Entrega Centro' }).click();
    await page
      .getByText(/2\.10 km/i)
      .first()
      .waitFor({ state: 'attached' });
    assert.equal(callCount, beforeOpen + 1, 'opening recalculates');
    if (width < 600) await page.getByRole('button', { name: 'Datos de ruta', exact: true }).click();
    assert.equal(await lat.nth(0).inputValue(), '19.43');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await page.getByText('Ruta guardada.', { exact: true }).waitFor();
    assert.equal(orders[0].attributes.routePlan.departureTime, '2026-11-01T09:30:12.345Z');
    assert.equal(orders[0].attributes.foreignAttribute, 'preserved');
    await page.getByRole('button', { name: 'Camión', exact: true }).click();
    assert.equal(
      await page.getByRole('button', { name: 'Calcular ruta', exact: true }).isEnabled(),
      false,
    );
    for (const [label, value] of [
      ['Altura (m)', '4.1'],
      ['Anchura (m)', '2.6'],
      ['Longitud (m)', '18'],
      ['Peso con carga (t)', '32'],
      ['Peso máximo por eje (t)', '9'],
    ])
      await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByRole('button', { name: 'Calcular ruta', exact: true }).click();
    await page
      .getByText(/2\.10 km/i)
      .first()
      .waitFor({ state: 'attached' });
    if (width < 600) await page.getByRole('button', { name: 'Datos de ruta', exact: true }).click();
    const arrived = new Promise((resolve) => {
      slowStarted = resolve;
    });
    console.log('Slow check', theme, width);
    mode = 'slow';
    await page.getByRole('button', { name: 'Calcular ruta', exact: true }).click();
    await page.waitForFunction(() =>
      document.querySelector('button[type="submit"]')?.textContent.includes('Calculando'),
    );
    await Promise.race([
      arrived,
      page.waitForTimeout(12000).then(() => {
        throw new Error('slow request never started');
      }),
    ]);
    // Editing aborts a pending response; no stale geometry or ETA may return.
    await lat.nth(1).fill('19.45');
    release?.();
    await page.waitForTimeout(300);
    assert.equal(await page.getByText(/2\.10 km/i).count(), 0);
    mode = 'error';
    await page.getByRole('button', { name: 'Calcular ruta', exact: true }).click();
    await page.getByText(/No se encontró una ruta vial/).waitFor();
    await page.getByText(/No se encontró una ruta vial/).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/error-${theme}-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Eliminar', exact: true }).click();
    await page.getByText('Ruta eliminada.', { exact: true }).waitFor();
    assert.equal(orders.length, 0);
    readonly = true;
    mode = 'ok';
    const previousWrites = writes;
    await page.reload();
    await page.getByRole('tab', { name: 'Calcular', exact: true }).click();
    await page.getByRole('button', { name: 'Opciones de ruta', exact: true }).click();
    await lat.nth(0).fill('19.43');
    await lon.nth(0).fill('-99.13');
    await lat.nth(1).fill('19.44');
    await lon.nth(1).fill('-99.14');
    await page.getByRole('button', { name: 'Calcular ruta', exact: true }).click();
    await page
      .getByText(/2\.10 km/i)
      .first()
      .waitFor({ state: 'attached' });
    if (width < 600) await page.getByRole('button', { name: 'Datos de ruta', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Guardar', exact: true }).count(), 0);
    assert.equal(writes, previousWrites);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    assert.deepEqual(errors, []);
    results.push({
      theme,
      width,
      calculateCalls: callCount,
      CRUD: true,
      reload: true,
      truck: true,
      stale: true,
      readonly: true,
      noOverflow: true,
    });
    await context.close();
  }
  console.log('Routing UI PASS', results);
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
