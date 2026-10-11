/* global process, console, URL, document, innerWidth, window */
// Static build only: intercept every API, WebSocket and external request before navigation.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:18769';
const output = process.env.SCREENSHOT_DIR || '/tmp/novatrack-tolls-ui';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ['--no-sandbox'],
});
const evidence = [];
try {
  for (const [theme, width, height] of [
    ['light', 1440, 1000],
    ['dark', 1440, 1000],
    ['light', 390, 844],
    ['dark', 390, 844],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      colorScheme: theme,
      serviceWorkers: 'block',
      timezoneId: 'America/Mexico_City',
    });
    let mode = 'complete',
      release,
      readonly = false,
      legacyCalls = 0;
    const errors = [],
      requests = [],
      routeInputs = [],
      writes = [];
    const places = [
      {
        id: 1,
        name: 'Fashion Drive',
        area: 'CIRCLE (25.6513803 -100.3351787, 150)',
        attributes: {},
      },
      { id: 2, name: 'Terminal B', area: 'CIRCLE (25.7746465 -100.1117724, 70)', attributes: {} },
      { id: 3, name: 'Parada demo', area: 'CIRCLE (25.7 -100.22, 100)', attributes: {} },
    ];
    const address = {
      label: 'Terminal B · Aeropuerto de Monterrey',
      latitude: 25.7746465,
      longitude: -100.1117724,
      type: 'terminal',
    };
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(base).origin) return route.abort();
      if (url.pathname.startsWith('/empty-tile/'))
        return route.fulfill({
          contentType: 'image/png',
          body: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4ioAAAAASUVORK5CYII=',
            'base64',
          ),
        });
      if (!url.pathname.startsWith('/api/')) return route.continue();
      const path = url.pathname.slice(5),
        method = route.request().method();
      let json = [];
      if (path === 'server')
        json = {
          id: 1,
          routingEnabled: true,
          routingSearchEnabled: true,
          routingTollsEnabled: false,
          map: 'custom',
          mapUrl: `${base}/empty-tile/{z}/{x}/{y}.png`,
          attributes: { language: 'es', activeMapStyles: 'custom' },
        };
      if (path === 'routing/tolls/status') json = { enabled: true, catalog: true };
      if (path === 'session')
        json = {
          id: 1,
          readonly,
          administrator: false,
          name: 'Demo',
          attributes: { language: 'es' },
        };
      if (path === 'geofences') json = places;
      if (path === 'devices')
        json = [
          { id: 10, name: 'Unidad 10', uniqueId: 'synthetic', status: 'online', attributes: {} },
        ];
      if (path === 'routing/search')
        json = [
          address,
          {
            label: 'Aeropuerto de Monterrey',
            latitude: 25.7769254,
            longitude: -100.1066155,
            type: 'aerodrome',
          },
        ];
      if (path === 'routing/alternatives' || path === 'routing') {
        const input = route.request().postDataJSON();
        routeInputs.push(input);
        if (mode === 'no-route') return route.fulfill({ status: 422, json: { code: 'NO_ROUTE' } });
        const point = (p) => [p.longitude, p.latitude];
        const origin = point(input.origin),
          end = [-100.112023, 25.775753];
        const paid = {
          geometry: {
            type: 'LineString',
            coordinates: [origin, [-100.157725825, 25.691436099], [-100.13, 25.75], end],
          },
          distance: 35739.9,
          duration: 1950.8,
          departureTime: '2026-10-09T18:00:00Z',
          arrivalTime: '2026-10-09T18:32:30.800Z',
          provider: 'openrouteservice',
          profile: input.profile,
          traffic: false,
          attribution: 'ORS prueba aislada',
          tollways: [{ start: 0, end: 3, value: 1 }],
          accessPoints: [
            { point: input.origin, distance: 0 },
            { point: { latitude: end[1], longitude: end[0] }, distance: 550 },
          ],
        };
        const free = {
          ...paid,
          geometry: {
            type: 'LineString',
            coordinates: [origin, [-100.23, 25.75], [-100.15, 25.79], end],
          },
          distance: 37502.3,
          duration: 2186.5,
          arrivalTime: '2026-10-09T18:36:26.500Z',
          tollways: [{ start: 0, end: 3, value: 0 }],
        };
        if (input.waypoints?.length) {
          paid.geometry.coordinates.splice(1, 0, ...input.waypoints.map(point));
          paid.tollways[0].end = paid.geometry.coordinates.length - 1;
        }
        json = path === 'routing' ? paid : input.preference === 'free' ? [free] : [paid, free];
      } else if (path === 'routing/tolls/match') {
        const input = route.request().postDataJSON();
        requests.push(input);
        const requestedMode = mode;
        if (requestedMode === 'delay')
          await new Promise((resolve) => {
            release = resolve;
          });
        if (requestedMode === 'failure')
          return route.fulfill({ status: 502, json: { code: 'PROVIDER_UNAVAILABLE' } });
        const paid = input.tollways.some((section) => section.value === 1);
        const amount = input.axles === 5 ? 180 : 60 + input.extraAxles * 30;
        json = {
          currency: 'MXN',
          edition: '2025',
          source: 'https://www.inegi.org.mx/app/biblioteca/ficha.html?upc=794551163030',
          calculatedAt: '2026-10-09T18:00:00Z',
          total: paid ? amount : 0,
          knownTotal: paid ? amount : 0,
          complete: true,
          pendingSections: 0,
          charges: paid
            ? [
                {
                  description: 'Caseta Guadalupe · demo',
                  amount,
                  point: { latitude: 25.691436099, longitude: -100.157725825 },
                  tariffDate: '2025-02-13 12:00:00',
                },
              ]
            : [],
        };
        if (requestedMode === 'partial') {
          json.complete = false;
          json.total = null;
          json.charges.push({
            description: 'Caseta con tarifa pendiente · demo',
            amount: null,
            point: { latitude: 25.75, longitude: -100.13 },
            tariffDate: null,
          });
          json.pendingSections = 1;
        }
        if (requestedMode === 'malformed') delete json.charges[0].amount;
      } else if (path === 'routing/tolls') {
        legacyCalls++;
        json = {
          currency: 'MXN',
          total: 60,
          source: 'INEGI demo',
          calculatedAt: '2026-10-09T18:00:00Z',
          roadWarning: false,
          route: {
            geometry: {
              type: 'LineString',
              coordinates: [
                [-100.3351787, 25.6513803],
                [-100.157725825, 25.691436099],
                [-100.1117724, 25.7746465],
              ],
            },
            distance: 35000,
            duration: 1900,
            provider: 'inegi-sakbe',
            profile: 'car',
            arrivalTime: '2026-10-09T18:31:40Z',
            traffic: false,
            attribution: 'INEGI demo',
          },
          charges: [
            {
              description: 'Caseta demo viaje',
              amount: 60,
              point: { latitude: 25.691436099, longitude: -100.157725825 },
            },
          ],
        };
      } else if (method !== 'GET') {
        assert.equal(path, 'orders');
        writes.push(route.request().postDataJSON());
        json = { id: 100, ...writes.at(-1) };
      }
      return route.fulfill({ json });
    });
    await context.routeWebSocket('**/api/socket', (socket) => socket.onMessage(() => {}));
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', (error) => errors.push(error.message));
    const dataView = async () => {
      if (
        width < 900 &&
        (await page.getByRole('button', { name: 'Datos de ruta', exact: true }).isVisible())
      )
        await page.getByRole('button', { name: 'Datos de ruta', exact: true }).click();
    };
    const mapView = async () => {
      if (width < 900)
        await page.getByRole('button', { name: 'Mapa', exact: true }).first().click();
    };
    const planner = async () => {
      await page.goto(`${base}/routes`);
      await page.getByRole('heading', { name: 'Viajes y lugares' }).waitFor();
      assert.equal(
        await page
          .getByRole('tab', { name: 'Calcular', exact: true })
          .getAttribute('aria-selected'),
        'true',
        'Routes opens the calculator by default',
      );
      if (!routeInputs.length)
        await page.screenshot({ path: `${output}/default-${theme}-${width}.png` });
      const tabs = page.getByRole('tablist', { name: 'Viajes y lugares' }),
        menu = page.locator('.MuiBottomNavigation-root');
      const tabBounds = await tabs.boundingBox(),
        menuBounds = await menu.boundingBox();
      for (const label of ['Lugares', 'Calcular', 'Unidad más cercana', 'Viajes']) {
        await page.getByRole('tab', { name: label, exact: true }).focus();
        await page.keyboard.press('Enter');
        for (const [before, after] of [
          [tabBounds, await tabs.boundingBox()],
          [menuBounds, await menu.boundingBox()],
        ])
          for (const key of ['x', 'y', 'width', 'height'])
            assert.ok(Math.abs(before[key] - after[key]) <= 1, `${label}: navigation ${key}`);
      }
      await page.getByRole('tab', { name: 'Calcular', exact: true }).click();
      const title = await page
        .getByRole('heading', { name: 'Planificador de rutas' })
        .boundingBox();
      assert.ok(title.y >= tabBounds.y + tabBounds.height);
      assert.equal(
        await page.getByRole('button', { name: 'Volver a viajes', exact: true }).count(),
        0,
      );
      assert.equal(await page.getByLabel('Latitud', { exact: true }).first().isVisible(), false);
      const destinationSearch = page.getByRole('combobox', { name: 'Destino', exact: true });
      await destinationSearch.fill('Aeropuerto');
      await page.getByRole('option', { name: address.label, exact: true }).click();
      assert.equal(await destinationSearch.inputValue(), address.label);
      assert.equal(
        await page.getByLabel('Longitud', { exact: true }).nth(1).inputValue(),
        String(address.longitude),
      );
      await destinationSearch.clear();
      for (const [label, place] of [
        ['Origen', 'Fashion Drive'],
        ['Destino', 'Terminal B'],
      ]) {
        await page.getByRole('combobox', { name: label, exact: true }).click();
        await page.getByRole('option', { name: place, exact: true }).click();
      }
    };
    await planner();
    await page.getByRole('button', { name: 'Calcular ruta', exact: true }).click();
    await page
      .getByText(/MXN\s60\.00/)
      .filter({ visible: true })
      .first()
      .waitFor();
    assert.equal(legacyCalls, 0, 'Planner does not request an unrelated SAKBE route');
    await page
      .getByText(/Llegada estimada:.*12:32/)
      .filter({ visible: true })
      .first()
      .waitFor();
    assert.deepEqual(
      requests[0].geometry.coordinates,
      routeInputs[0].origin
        ? [
            [-100.3351787, 25.6513803],
            [-100.157725825, 25.691436099],
            [-100.13, 25.75],
            [-100.112023, 25.775753],
          ]
        : [],
    );
    await dataView();
    await page.getByText(/La vía calculada queda separada del punto elegido/).waitFor();
    const alternatives = page.getByRole('group', { name: 'Rutas alternativas' });
    assert.equal(await alternatives.getByRole('button').count(), 2);
    const summary = page.getByText(/^Presupuesto de casetas: MXN/).first();
    assert.match(await summary.innerText(), /60\.00/);
    assert.equal(
      await page.getByRole('button', { name: 'Volver a ruta planeada', exact: true }).count(),
      0,
    );
    const maps = page.getByRole('link', { name: 'Abrir puntos en Google Maps' });
    const mapsUrl = new URL(await maps.getAttribute('href'));
    assert.equal(mapsUrl.searchParams.get('destination'), '25.7746465,-100.1117724');
    await summary.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/summary-${theme}-${width}.png` });
    await mapView();
    await page.locator('.route-toll-marker').first().waitFor();
    assert.equal(await page.locator('.route-toll-marker').count(), 1);
    const colors = await page.evaluate(async () => {
      const entry = document.querySelector('script[type="module"][src]').src;
      const module = await import(entry);
      const map = Object.values(module).find((value) => typeof value?.getStyle === 'function');
      const lines = map.getStyle().layers.filter((layer) => layer.type === 'line');
      const sources = new Set(lines.map((layer) => layer.source));
      window.routeLayerRemovals = 0;
      window.routeCameraRefits = 0;
      const removeSource = map.removeSource.bind(map);
      map.removeSource = (id) => {
        if (sources.has(id)) window.routeLayerRemovals += 1;
        return removeSource(id);
      };
      const fitBounds = map.fitBounds.bind(map);
      map.fitBounds = (...args) => {
        window.routeCameraRefits += 1;
        return fitBounds(...args);
      };
      return lines.map((layer) => map.getSource(layer.source).serialize().data.properties.color);
    });
    assert.deepEqual(
      new Set(colors),
      new Set(['#3bb2d0', theme === 'light' ? '#ed6c02' : '#ffa726']),
    );
    const beforeRefresh = { roads: routeInputs.length, quotes: requests.length };
    assert.deepEqual(beforeRefresh, { roads: 1, quotes: 1 }, 'One road and one price calculation');
    await dataView();
    await page.getByRole('button', { name: 'Presupuesto de casetas', exact: true }).click();
    await page.getByRole('button', { name: 'Calcular casetas', exact: true }).click();
    await page.getByText(/^Presupuesto de casetas: MXN\s60\.00$/).waitFor();
    assert.equal(
      routeInputs.length,
      beforeRefresh.roads,
      'Refreshing prices does not recalculate roads',
    );
    assert.equal(
      requests.length,
      beforeRefresh.quotes + 1,
      'One quote request per explicit refresh',
    );
    assert.equal(
      await page.evaluate(() => window.routeLayerRemovals),
      0,
      'Price updates preserve route layers',
    );
    assert.equal(
      await page.evaluate(() => window.routeCameraRefits),
      0,
      'Price updates preserve the camera position',
    );
    await page.getByRole('button', { name: 'Presupuesto de casetas', exact: true }).click();
    await mapView();
    // Clicking the painted route must be consumed instead of changing the selected destination.
    const startMarker = page.locator('.maplibregl-marker').filter({ hasText: /^A$/ });
    const a = await startMarker.boundingBox();
    const toll = await page.locator('.route-toll-marker').first().boundingBox();
    const beforeLineClick = routeInputs.length;
    const lonBefore = await page.getByLabel('Longitud', { exact: true }).nth(1).inputValue();
    await page.mouse.click(
      (a.x + a.width / 2 + toll.x + toll.width / 2) / 2,
      (a.y + a.height / 2 + toll.y + toll.height / 2) / 2,
    );
    await page.waitForTimeout(100);
    assert.equal(
      await page.getByLabel('Longitud', { exact: true }).nth(1).inputValue(),
      lonBefore,
      'The selected route is rendered and consumes clicks after the quote updates',
    );
    assert.equal(routeInputs.length, beforeLineClick);

    assert.match(await page.locator('.route-toll-marker').innerText(), /60\.00/);
    await page.getByRole('img', { name: 'Fin vial · 550 m' }).waitFor();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${output}/map-${theme}-${width}.png` });
    // Project the alternative vertex from the two requested endpoints in Web Mercator.
    const b = await page.locator('.maplibregl-marker').filter({ hasText: /^B$/ }).boundingBox();
    const mercatorY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
    const altX =
      a.x +
      a.width / 2 +
      ((-100.23 + 100.3351787) / (-100.1117724 + 100.3351787)) *
        (b.x + b.width / 2 - a.x - a.width / 2);
    const altY =
      a.y +
      a.height / 2 +
      ((mercatorY(25.75) - mercatorY(25.6513803)) /
        (mercatorY(25.7746465) - mercatorY(25.6513803))) *
        (b.y + b.height / 2 - a.y - a.height / 2);
    await page.mouse.click((a.x + a.width / 2 + altX) / 2, (a.y + a.height / 2 + altY) / 2);
    await dataView();
    await page.getByText(/^Presupuesto de casetas: MXN\s0\.00$/).waitFor();
    assert.equal(
      routeInputs.length,
      beforeRefresh.roads,
      'Selecting an existing alternative does not recalculate roads',
    );
    assert.equal(
      await alternatives.getByRole('button').nth(1).getAttribute('aria-pressed'),
      'true',
    );
    await alternatives.getByRole('button').first().click();
    await page.getByText(/^Presupuesto de casetas: MXN\s60\.00$/).waitFor();
    await mapView();
    await page.locator('.route-toll-marker').first().focus();
    await page.keyboard.press('Enter');
    await page
      .locator('.maplibregl-popup')
      .getByText('Caseta Guadalupe · demo', { exact: true })
      .waitFor();
    await dataView();
    await alternatives.getByRole('button').nth(1).focus();
    await page.keyboard.press('Enter');
    await page.getByText(/^Presupuesto de casetas: MXN\s0\.00$/).waitFor();
    assert.equal(await page.locator('.route-toll-marker').count(), 0);
    assert.equal(await page.locator('.maplibregl-popup').count(), 0);
    assert.ok(requests.at(-1).tollways.every((section) => section.value === 0));
    assert.equal(
      await alternatives.getByRole('button').nth(1).getAttribute('aria-pressed'),
      'true',
    );
    mode = 'partial';
    await alternatives.getByRole('button').first().click();
    await page.getByText(/^Presupuesto de casetas: Precio pendiente/).waitFor();
    assert.equal(await page.locator('.route-toll-marker').count(), 2);
    assert.match(await page.locator('.route-toll-marker').last().innerText(), /Precio pendiente/);
    await page.getByRole('button', { name: 'Presupuesto de casetas', exact: true }).click();
    await page.getByText(/Presupuesto parcial:/).waitFor();
    await page.getByRole('button', { name: 'Detalles · INEGI', exact: true }).click();
    await page.getByText('Caseta con tarifa pendiente · demo', { exact: true }).waitFor();
    await page.getByText(/Tarifa del catálogo: 2025-02-13/).waitFor();
    await page.getByText(/Presupuesto parcial:/).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/partial-${theme}-${width}.png` });
    await mapView();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${output}/partial-map-${theme}-${width}.png` });
    await dataView();
    mode = 'failure';
    await page.getByRole('button', { name: 'Calcular casetas', exact: true }).click();
    await page.getByText(/No se pudo consultar el presupuesto/).waitFor();
    assert.equal(await page.locator('.route-toll-marker').count(), 0);
    assert.match(
      await page.getByText(/^Presupuesto de casetas: Precio pendiente/).innerText(),
      /Precio pendiente$/,
    );
    mode = 'malformed';
    await page.getByRole('button', { name: 'Calcular casetas', exact: true }).click();
    await page.getByText(/No se pudo consultar el presupuesto/).waitFor();
    assert.equal(await page.locator('.route-toll-marker').count(), 0);
    // A late price for the previous geometry must not replace the newly selected free alternative.
    mode = 'delay';
    release = null;
    await page.getByRole('button', { name: 'Calcular casetas', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[role="status"]'));
    while (!release) await page.waitForTimeout(20);
    mode = 'complete';
    await alternatives.getByRole('button').nth(1).click();
    await page.getByText(/^Presupuesto de casetas: MXN\s0\.00$/).waitFor();
    release();
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.route-toll-marker').count(), 0);
    assert.equal(
      await alternatives.getByRole('button').nth(1).getAttribute('aria-pressed'),
      'true',
    );
    // Extra axles reprice automatically without another road calculation.
    await alternatives.getByRole('button').first().click();
    await page.getByText(/^Presupuesto de casetas: MXN\s60\.00$/).waitFor();
    await page.getByRole('button', { name: 'Opciones de casetas', exact: true }).click();
    const beforeRoadCalls = routeInputs.length;
    await page.getByRole('combobox', { name: 'Ejes excedentes', exact: true }).click();
    await page.getByRole('option', { name: '1', exact: true }).click();
    await page.getByText(/^Presupuesto de casetas: MXN\s90\.00$/).waitFor();
    assert.equal(routeInputs.length, beforeRoadCalls);
    assert.equal(requests.at(-1).extraAxles, 1);
    // Adding an intermediate stop invalidates the old result and the new quote receives its full geometry.
    await page.getByRole('button', { name: 'Añadir parada', exact: true }).click();
    await page.getByRole('combobox', { name: 'Parada 1', exact: true }).click();
    await page.getByRole('option', { name: 'Parada demo', exact: true }).click();
    await page.getByRole('button', { name: 'Calcular ruta', exact: true }).click();
    await page
      .getByText(/MXN\s60\.00/)
      .filter({ visible: true })
      .first()
      .waitFor();
    await dataView();
    assert.deepEqual(requests.at(-1).geometry.coordinates[1], [-100.22, 25.7]);
    const withStopMaps = new URL(
      await page.getByRole('link', { name: 'Abrir puntos en Google Maps' }).getAttribute('href'),
    );
    assert.equal(withStopMaps.searchParams.get('waypoints'), '25.7,-100.22');
    // Readonly operators can calculate but cannot save or delete existing routes.
    readonly = true;
    await planner();
    assert.equal(await page.getByRole('button', { name: 'Guardar', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Calcular ruta', exact: true }).click();
    await page
      .getByText(/MXN\s60\.00/)
      .filter({ visible: true })
      .first()
      .waitFor();
    await dataView();
    assert.deepEqual(writes, []);
    assert.deepEqual(errors, []);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
    );
    // Existing trip draft retains the legacy A-B quote flow until a road is explicitly calculated there.
    readonly = false;
    await page.goto(`${base}/routes`);
    await page.getByRole('tab', { name: 'Viajes', exact: true }).click();
    await page.getByRole('button', { name: 'Nuevo viaje', exact: true }).click();
    for (const [label, place] of [
      ['Origen', 'Fashion Drive'],
      ['Destino', 'Terminal B'],
    ]) {
      await page.getByRole('combobox', { name: label, exact: false }).click();
      await page.getByRole('option', { name: place, exact: true }).click();
    }
    await page.getByRole('button', { name: 'Presupuesto de casetas', exact: true }).click();
    await page.getByRole('button', { name: 'Calcular casetas', exact: true }).click();
    await page.locator('.route-toll-marker').first().waitFor();
    assert.equal(legacyCalls, 1);
    evidence.push({
      theme,
      width,
      height,
      matchRequests: requests.length,
      roadRequests: routeInputs.length,
      legacyTripRequests: legacyCalls,
      initialCalculationRequests: beforeRefresh,
      priceRefreshRemovedRouteSources: 0,
      priceRefreshCameraRefits: 0,
      alternativeColors: colors,
      writes: writes.length,
      pageErrors: errors,
    });
    await context.close();
    console.log('PASS toll routes', theme, width);
  }
  await writeFile(`${output}/results.json`, JSON.stringify(evidence, null, 2));
  console.log(
    'PASS alternatives, exact geometry, terminal arrival warning, partial fees, stale response, categories, stops, Maps, readonly, legacy trip, light/dark, desktop/mobile',
  );
} finally {
  await browser.close();
}
