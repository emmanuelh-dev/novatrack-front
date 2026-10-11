/* global process, URL, document, innerWidth, getComputedStyle */
// Run against a static build; API data is synthetic and never reaches production.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/check-main-screen.mjs
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ['--no-sandbox'],
});
const output = process.env.SCREENSHOT_DIR || '/tmp/novatrack-main-screen';
await mkdir(output, { recursive: true });
const devices = [
  { id: 1, name: 'Unidad 01 · Reparto Centro', status: 'online', category: 'truck' },
  { id: 2, name: 'Unidad 02 · Distribución Norte', status: 'offline', category: 'van' },
  {
    id: 3,
    name: 'Unidad 03 · Nombre largo para comprobar el espacio disponible',
    status: 'unknown',
    category: 'car',
  },
].map((device) => ({
  ...device,
  uniqueId: `demo-${device.id}`,
  groupId: 0,
  disabled: false,
  lastUpdate: new Date(Date.now() - device.id * 60000).toISOString(),
  attributes: device.id === 3 ? { deviceImage: 'demo.svg' } : {},
}));
try {
  for (const [name, width, height, colorScheme] of [
    ['desktop-light', 1440, 900, 'light'],
    ['desktop-dark', 1440, 900, 'dark'],
    ['mobile-light', 390, 844, 'light'],
    ['mobile-dark', 390, 844, 'dark'],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      colorScheme,
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.startsWith('/api/media/')) {
        await route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="288" height="144"><rect width="288" height="144" fill="#404040"/></svg>',
        });
        return;
      }
      const data =
        {
          '/api/server': {
            id: 1,
            newServer: false,
            latitude: 19.4326,
            longitude: -99.1332,
            zoom: 12,
            map: 'custom',
            mapUrl: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png',
            attributes: { language: 'es', activeMapStyles: 'custom' },
          },
          '/api/session': {
            id: 1,
            name: 'Operador demo',
            administrator: true,
            attributes: { language: 'es' },
          },
          '/api/devices': devices,
        }[path] || [];
      await route.fulfill({ json: data });
    });
    await page.routeWebSocket('**/api/socket', (socket) => {
      socket.onMessage(() => {});
      socket.send(
        JSON.stringify({
          positions: devices.map((device) => ({
            id: device.id,
            deviceId: device.id,
            protocol: 'demo',
            valid: true,
            latitude: 19.4326 + device.id * 0.006,
            longitude: -99.1332 + device.id * 0.006,
            speed: 0,
            course: 0,
            accuracy: 0,
            altitude: 0,
            fixTime: new Date().toISOString(),
            deviceTime: new Date().toISOString(),
            serverTime: new Date().toISOString(),
            attributes: { ignition: device.id === 1, batteryLevel: 85 },
          })),
        }),
      );
    });
    await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:18765', {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    await page.getByPlaceholder('Buscar Dispositivos').waitFor();

    const counter = page.getByRole('status').filter({ hasText: '3 / 3' });
    await counter.waitFor();
    if (width < 900) await page.getByRole('button', { name: 'Dispositivos', exact: true }).click();
    const search = page.getByRole('textbox', { name: 'Buscar Dispositivos' });
    await search.fill('Unidad 02');
    await page.getByRole('status').filter({ hasText: '1 / 3' }).waitFor();
    assert.equal(await page.getByRole('button', { name: /Unidad 01/ }).count(), 0);
    await search.fill('Sin coincidencias');
    await page.getByText('Sin datos', { exact: true }).waitFor();
    await page.getByRole('status').filter({ hasText: '0 / 3' }).waitFor();
    await search.fill('');
    await counter.waitFor();
    await page.getByRole('button', { name: 'Estado, Grupos, Geo-Zonas' }).click();
    await page.getByRole('combobox', { name: 'Estado', exact: true }).click();
    await page.getByRole('option', { name: 'En línea (1)', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.getByRole('status').filter({ hasText: '1 / 3' }).waitFor();
    assert.equal(await page.getByRole('button', { name: /Unidad 02/ }).count(), 0);
    await page.getByRole('button', { name: 'Estado, Grupos, Geo-Zonas' }).click();
    await page.getByRole('combobox', { name: 'Estado', exact: true }).click();
    await page.getByRole('option', { name: 'En línea (1)', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await counter.waitFor();
    const row = page.getByRole('button', { name: /Unidad 01/ });
    await row.focus();
    await page.keyboard.press('Enter');
    if (width < 900) await page.getByRole('button', { name: 'Dispositivos', exact: true }).click();
    assert.equal(await row.getAttribute('aria-pressed'), 'true');
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.locator('.maplibregl-ctrl-scale').waitFor({ state: 'attached' });
    await page.waitForLoadState('networkidle', { timeout: 20000 });
    const card = page.getByRole('region', { name: devices[0].name, exact: true });
    await card.getByRole('heading', { name: devices[0].name, level: 2 }).waitFor();
    assert.equal(await row.evaluate((el) => getComputedStyle(el).borderTopWidth), '0px');
    assert.equal(await card.evaluate((el) => getComputedStyle(el).borderTopWidth), '0px');
    await card.getByText('Última Actualización:', { exact: false }).waitFor();
    const scroll = await card.evaluate((el) => getComputedStyle(el).scrollbarColor);
    assert.notEqual(scroll, 'auto');
    if (colorScheme === 'dark') assert.ok(scroll.includes('rgb(33, 33, 33)'));
    await card.getByRole('button', { name: 'Extra', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Google Maps', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await page.screenshot({ path: `${output}/${name}.png` });
    await card.getByRole('button', { name: 'Ocultar', exact: true }).click();
    await card.waitFor({ state: 'hidden' });
    const longRow = page.getByRole('button', { name: /Unidad 03/ });
    const indicator = longRow.getByRole('img', { name: 'Encendido: No', exact: true });
    assert.equal(await indicator.getAttribute('tabindex'), '0');
    await longRow.focus();
    await page.keyboard.press('Enter');
    const imageCard = page.getByRole('region', { name: devices[2].name, exact: true });
    await imageCard.waitFor();
    const media = await imageCard.locator('.draggable-header').boundingBox();
    const header = await imageCard.locator('.draggable-header > div').boundingBox();
    assert.ok(header.y + header.height <= media.y + media.height, 'Image header overlap');
    await page.screenshot({ path: `${output}/${name}-image-card.png` });
    assert.deepEqual(errors, []);
    await context.close();
    process.stdout.write(
      `${name}: search, filters, counts, empty state, keyboard selection, borderless StatusCard, menu, close, scrollbars and overflow OK\n`,
    );
  }
} finally {
  await browser.close();
}
