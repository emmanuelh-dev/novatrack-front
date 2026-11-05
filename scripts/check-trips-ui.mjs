/* global process, console, URL, document, getComputedStyle, innerWidth, innerHeight */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';
import { placePoint } from '../src/routes/routePlan.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:18769';
const output = process.env.SCREENSHOT_DIR || '/tmp/anacondda-trips-ui';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ['--no-sandbox'],
});
const places = [1, 2].map((id) => ({
  id,
  name: id === 1 ? 'Qualtia Conductores' : 'CEDIS Monterrey',
  area: `CIRCLE (${25.7 + id * 0.01} -100.3, 150)`,
  attributes: { customer: 'Demo' },
}));
const placeSnapshot = (item) => ({
  id: item.id,
  name: item.name,
  area: item.area,
  address: item.name,
  point: placePoint(item),
});
const summary = [];
let lastPage;
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
      hasTouch: width < 900,
      serviceWorkers: 'block',
    });
    let orders = [],
      stale = false,
      status = 'planned',
      writes = 0,
      readonly = false,
      searchEnabled = true,
      searches = 0,
      reports = 0,
      imageWrites = 0,
      nativeEdits = 0,
      savedPlaces = [...places],
      resumeReport,
      failedSecondReport = false;
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
          routingSearchEnabled: searchEnabled,
          map: 'custom',
          mapUrl: `${base}/empty-tile/{z}/{x}/{y}.png`,
          attributes: { language: 'es', activeMapStyles: 'custom' },
        };
      if (path === 'session')
        json = {
          id: 1,
          readonly,
          name: 'Operador demo',
          administrator: false,
          attributes: { language: 'es' },
        };
      if (path === 'devices')
        json = [{ id: 10, name: 'Unidad 10', uniqueId: 'demo', status: 'online', attributes: {} }];
      if (path === 'geofences') {
        if (method === 'POST') {
          json = { ...route.request().postDataJSON(), id: savedPlaces.length + 1 };
          assert.match(json.area, /^(CIRCLE|POLYGON)/);
          savedPlaces.push(json);
        } else json = savedPlaces;
      }
      if (/^geofences\/\d+$/.test(path) && method === 'PUT') {
        json = route.request().postDataJSON();
        assert.equal(json.id, 1);
        assert.equal(json.attributes.customer, 'Demo', 'keep existing geofence attributes');
        assert.equal(json.attributes.routePlace.address, '');
        savedPlaces = savedPlaces.map((item) => (item.id === json.id ? json : item));
        nativeEdits++;
      }
      if (path === 'geofences/3/image') {
        if (method === 'POST') {
          imageWrites++;
          return route.fulfill({ status: 204 });
        }
        return route.fulfill({ status: 404 });
      }
      if (path === 'reports/geofences') {
        const zoneId = Number(url.searchParams.get('geofenceId'));
        assert.ok([1, 2].includes(zoneId));
        if (zoneId === 2 && !failedSecondReport) {
          await new Promise((resolve) => {
            resumeReport = resolve;
          });
          failedSecondReport = true;
          return route.fulfill({ status: 500, body: 'Synthetic report failure' });
        }
        assert.equal(url.searchParams.get('deviceId'), '10');
        reports++;
        json = [
          {
            deviceId: 10,
            geofenceId: zoneId,
            startTime: new Date(Date.now() - 600000).toISOString(),
            endTime: new Date().toISOString(),
          },
        ];
      }
      if (path === 'orders') json = orders;
      if (path === 'routing') {
        const input = route.request().postDataJSON();
        json = {
          distance: 12000,
          duration: 900,
          arrivalTime: new Date(
            new Date(input.departureTime || Date.now()).getTime() + 900000,
          ).toISOString(),
          geometry: {
            type: 'LineString',
            coordinates: [input.origin, ...(input.waypoints || []), input.destination].map(
              (point) => [point.longitude, point.latitude],
            ),
          },
        };
      }
      if (path === 'routing/search') {
        searches++;
        json = url.searchParams.get('q').startsWith('Fashion')
          ? [
              {
                label: 'Fashion Drive, San Pedro Garza García',
                latitude: 25.651,
                longitude: -100.336,
              },
            ]
          : [
              {
                label: 'Qualtia, Avenida Conductores, Monterrey',
                latitude: 25.71,
                longitude: -100.3,
              },
            ];
      }
      if (path === 'orders/trips' && method === 'POST') {
        const input = route.request().postDataJSON();
        assert.equal(input.deviceId, 10);
        assert.equal(input.originId, 1);
        assert.equal(input.destinationId, 2);
        const trip = {
          version: 1,
          deviceId: 10,
          origin: placeSnapshot(places[0]),
          destination: placeSnapshot(places[1]),
          stops: (input.stopIds || []).map((id) => ({
            place: placeSnapshot(savedPlaces.find((item) => item.id === id)),
            arrivedTime: null,
          })),
          departureMode: input.departureMode || 'manual',
          request: {
            origin: placeSnapshot(places[0]).point,
            destination: placeSnapshot(places[1]).point,
            profile: 'car',
            waypoints: (input.stopIds || []).map((id) =>
              placePoint(savedPlaces.find((item) => item.id === id)),
            ),
            departureTime: input.departureTime,
          },
          plannedDistance: 12000,
          plannedDuration: 900,
          plannedArrival: new Date(new Date(input.departureTime).getTime() + 900000).toISOString(),
          dwellSeconds: 120,
          status,
        };
        json = { id: 7, description: input.name, attributes: { routeTrip: trip } };
        orders = [json];
        writes++;
      }
      if (path === 'orders/7/status') {
        const action = route.request().postDataJSON().action;
        status = {
          start: orders[0].attributes.routeTrip.departureMode === 'origin' ? 'ready' : 'active',
          complete: 'completed',
          cancel: 'cancelled',
        }[action];
        orders[0].attributes.routeTrip.status = status;
        json = orders[0];
        writes++;
      }
      if (path === 'orders/7/progress') {
        json = {
          trip: { ...orders[0].attributes.routeTrip, status },
          stale,
          next:
            stale || status !== 'active' || !orders[0].attributes.routeTrip.stops?.length
              ? null
              : {
                  distance: 5000,
                  duration: 300,
                  arrivalTime: new Date(Date.now() + 300000).toISOString(),
                },
          position: {
            deviceId: 10,
            valid: true,
            latitude: 25.715,
            longitude: -100.3,
            fixTime: new Date(Date.now() - (stale ? 600000 : 5000)).toISOString(),
          },
          remaining:
            stale || status !== 'active'
              ? null
              : {
                  distance: 6000,
                  duration: 480,
                  arrivalTime: new Date(Date.now() + 480000).toISOString(),
                  geometry: {
                    type: 'LineString',
                    coordinates: [
                      [-100.3, 25.715],
                      ...orders[0].attributes.routeTrip.stops
                        .filter((stop) => !stop.arrivedTime)
                        .map((stop) => [stop.place.point.longitude, stop.place.point.latitude]),
                      [-100.3, 25.72],
                    ],
                  },
                },
        };
      }
      return route.fulfill({ json });
    });
    await context.routeWebSocket('**/api/socket', (socket) => socket.onMessage(() => {}));
    const page = await context.newPage();
    lastPage = page;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.setDefaultTimeout(10000);
    await page.goto(`${base}/routes`);
    await page.getByRole('heading', { name: 'Viajes y lugares' }).waitFor();
    for (const tab of await page.getByRole('tab').all()) {
      const box = await tab.boundingBox();
      assert.ok(
        box && box.x >= 0 && box.x + box.width <= (width < 900 ? width : 380),
        'all route sections must be visible without horizontal scrolling',
      );
    }
    await page.getByRole('tab', { name: 'Viajes', exact: true }).click();
    await page.getByRole('button', { name: 'Nuevo viaje', exact: true }).click();
    await page.getByLabel(/Nombre del viaje/).fill('Entrega demo');
    for (const [label, option] of [
      ['Origen', 'Qualtia Conductores'],
      ['Destino', 'CEDIS Monterrey'],
      ['Unidad', 'Unidad 10'],
    ]) {
      await page.getByRole('combobox', { name: new RegExp(`^${label}`) }).click();
      if (label === 'Origen')
        await page.screenshot({ path: `${output}/origin-geozones-${theme}-${width}.png` });
      await page.getByRole('option', { name: option, exact: true }).click();
    }
    await page.getByRole('button', { name: 'Calcular ruta', exact: true }).click();
    await page
      .getByText(/^12.00 km$/i)
      .first()
      .waitFor();
    await page.getByRole('button', { name: 'Crear viaje', exact: true }).click();
    await page.getByRole('heading', { name: 'Entrega demo' }).waitFor();
    await page.getByRole('button', { name: 'Iniciar viaje', exact: true }).click();
    await page.getByText(/6.00 km/i).waitFor();
    await page.screenshot({ path: `${output}/trip-${theme}-${width}.png` });
    stale = true;
    await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await page
      .getByText('Ubicación antigua. No se puede mostrar una llegada actual.', { exact: true })
      .waitFor();
    assert.equal(await page.getByText(/6.00 km/i).count(), 0);
    status = 'arrived';
    stale = false;
    await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await page.getByRole('button', { name: 'Completar viaje', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await page.getByText('Completado', { exact: true }).first().waitFor();
    await page.getByRole('tab', { name: 'Lugares', exact: true }).click();
    const savedZones = page.getByRole('list', { name: 'Geozonas guardadas', exact: true });
    assert.equal(await savedZones.getByRole('button').count(), 2);
    await savedZones.getByRole('button', { name: 'Qualtia Conductores', exact: true }).click();
    assert.equal(
      await page.getByRole('textbox', { name: /Nombre del lugar/ }).inputValue(),
      'Qualtia Conductores',
    );
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    assert.ok(await savedZones.isVisible());
    await page.screenshot({ path: `${output}/geofences-list-${theme}-${width}.png` });
    const mapCursor = () =>
      page
        .locator('canvas.maplibregl-canvas')
        .evaluate((canvas) => getComputedStyle(canvas).cursor);
    const captureCursor = async (name, x, y) => {
      if (width < 900) return;
      await page.mouse.move(x, y);
      // Browser screenshots omit the OS cursor; show its computed SVG at the actual hotspot.
      await page.evaluate(
        ({ x, y }) => {
          const cursor = getComputedStyle(
            document.querySelector('canvas.maplibregl-canvas'),
          ).cursor;
          const [, url, tipX, tipY] = cursor.match(/^url\("(.+)"\) (\d+) (\d+)/);
          const image = document.createElement('img');
          image.id = 'test-cursor';
          image.src = url;
          image.style.cssText = `position:fixed;left:${x - tipX}px;top:${y - tipY}px;width:32px;height:32px;pointer-events:none;z-index:1500`;
          document.body.append(image);
        },
        { x, y },
      );
      await page.screenshot({ path: `${output}/cursor-${name}-${theme}-${width}.png` });
      await page.locator('#test-cursor').evaluate((image) => image.remove());
    };
    assert.doesNotMatch(await mapCursor(), /url\(/, 'no picking cursor without a place draft');
    await page.getByRole('combobox', { name: 'Geozonas guardadas', exact: true }).click();
    await page.getByRole('option', { name: 'Qualtia Conductores', exact: true }).click();
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await page
      .getByText('Lugar guardado. Ya puedes elegirlo como origen o destino.', { exact: true })
      .waitFor();
    assert.equal(nativeEdits, 1, 'edit native geofence in place without creating a duplicate');
    assert.equal(savedPlaces.length, 2);
    await page.screenshot({ path: `${output}/native-place-${theme}-${width}.png` });
    await page.getByRole('button', { name: 'Nuevo lugar', exact: true }).click();
    await page.locator('.mapbox-gl-draw_polygon.active').waitFor();
    assert.match(await mapCursor(), /url\(.+\) 4 28, crosshair$/, 'pencil tip while drawing');
    assert.equal(
      await page.locator('.mapbox-gl-draw_polygon').isVisible(),
      true,
      'new places must open the geofence drawing tools directly',
    );
    if (width < 900)
      await page.getByRole('button', { name: 'Datos de ruta', exact: true }).first().click();
    assert.equal(
      await page.getByRole('spinbutton', { name: 'Latitud', exact: true }).isVisible(),
      false,
    );
    await page.getByRole('combobox', { name: 'Forma de la zona', exact: true }).click();
    await page.getByRole('option', { name: 'Círculo', exact: true }).click();
    await page.getByRole('button', { name: 'Dibujar zona en mapa', exact: true }).click();
    assert.match(await mapCursor(), /url\(.+\) 16 30, crosshair$/, 'pin tip for circle center');
    const circleCanvas = await page.locator('canvas.maplibregl-canvas').boundingBox();
    await page.mouse.click(
      circleCanvas.x + circleCanvas.width / 2,
      circleCanvas.y + circleCanvas.height / 2,
    );
    await captureCursor(
      'pin',
      circleCanvas.x + circleCanvas.width / 2,
      circleCanvas.y + circleCanvas.height / 2,
    );
    await page.screenshot({ path: `${output}/circle-map-${theme}-${width}.png` });
    if (width < 900)
      await page.getByRole('button', { name: 'Datos de ruta', exact: true }).first().click();
    assert.equal(
      await page.getByRole('button', { name: 'Guardar', exact: true }).isDisabled(),
      true,
      'a new zone still needs its name',
    );
    await page.getByLabel(/Nombre del lugar/).fill('Almacén demo');
    assert.equal(
      await page.getByRole('button', { name: 'Guardar', exact: true }).isEnabled(),
      true,
      'circle with name does not need an address or road entrance',
    );
    await page.getByRole('combobox', { name: 'Dirección (opcional)', exact: true }).fill('Qualtia');
    await page
      .getByRole('option', { name: 'Qualtia, Avenida Conductores, Monterrey', exact: true })
      .click();
    await page.getByRole('button', { name: 'Icono e imagen', exact: true }).click();
    await page.locator('input[type=file]').setInputFiles({
      name: 'place.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4ioAAAAASUVORK5CYII=',
        'base64',
      ),
    });
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await page
      .getByText('Lugar guardado. Ya puedes elegirlo como origen o destino.', { exact: true })
      .waitFor();
    assert.equal(imageWrites, 1);
    assert.match(savedPlaces.at(-1).area, /^CIRCLE/);
    assert.ok(
      !savedPlaces.at(-1).area.startsWith('CIRCLE (25.71 '),
      'selecting an address must preserve the map circle center',
    );
    assert.equal(await page.locator('input[type=file]').evaluate((input) => input.files.length), 0);
    await page.screenshot({ path: `${output}/place-${theme}-${width}.png` });
    assert.equal(await page.locator('.MuiBottomNavigation-root').count(), 1);
    await page.keyboard.press('Tab');
    await page.getByRole('combobox', { name: 'Geozonas guardadas', exact: true }).click();
    await page.getByRole('option', { name: 'Qualtia Conductores', exact: true }).click();
    await page.getByRole('button', { name: 'Ver reporte de visitas', exact: true }).click();
    await page.getByRole('heading', { name: 'Viajes y lugares' }).waitFor();
    assert.equal(await page.locator('.MuiBottomNavigation-root').count(), 1);
    await page
      .getByRole('heading', { name: 'Ver reporte de visitas: Qualtia Conductores' })
      .waitFor();
    assert.equal(
      await page.getByRole('combobox', { name: 'Geo-Zonas', exact: true }).isDisabled(),
      true,
    );
    await page.getByRole('combobox', { name: 'Dispositivos', exact: true }).click();
    await page.getByRole('option', { name: 'Unidad 10', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Mostrar', exact: true }).click();
    await page.getByRole('cell', { name: 'Qualtia Conductores', exact: true }).waitFor();
    assert.equal(reports, 1);
    await page.screenshot({ path: `${output}/visits-${theme}-${width}.png` });
    if (width < 900)
      await page.getByRole('button', { name: 'Datos de ruta', exact: true }).first().click();
    await page.getByRole('combobox', { name: 'Geozonas guardadas', exact: true }).click();
    await page.getByRole('option', { name: 'CEDIS Monterrey', exact: true }).click();
    const nextReport = page.waitForRequest(
      (request) =>
        request.url().includes('reports/geofences') && request.url().includes('geofenceId=2'),
    );
    await page.getByRole('button', { name: 'Ver reporte de visitas', exact: true }).click();
    await nextReport;
    await page.getByRole('heading', { name: 'Ver reporte de visitas: CEDIS Monterrey' }).waitFor();
    assert.equal(
      await page.getByRole('cell', { name: 'Qualtia Conductores', exact: true }).count(),
      0,
      'previous place results must clear while next report loads',
    );
    const failedReport = page.waitForResponse(
      (response) => response.url().includes('reports/geofences') && response.status() === 500,
    );
    resumeReport();
    await failedReport;
    await page.waitForFunction(() => !document.querySelector('.MuiSkeleton-root'));
    assert.equal(
      await page.getByRole('cell', { name: 'Qualtia Conductores', exact: true }).count(),
      0,
      'failed next place report must not show previous place rows',
    );
    await page.locator('.MuiSnackbar-root').getByRole('button').click();
    await page.getByRole('button', { name: 'Mostrar', exact: true }).click();
    await page.getByRole('cell', { name: 'CEDIS Monterrey', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Volver al mapa' }).click();
    await page.getByRole('button', { name: 'Nuevo lugar', exact: true }).click();
    // The new-place action arms polygon drawing without a second map/tool action.
    await page.locator('.mapbox-gl-draw_polygon.active').waitFor();
    assert.match(await mapCursor(), /url\(.+\) 4 28, crosshair$/, 'pencil for the new polygon');
    if (width < 900)
      await page.getByRole('button', { name: 'Datos de ruta', exact: true }).first().click();
    const address = page.getByRole('combobox', { name: 'Dirección (opcional)', exact: true });
    for (const [query, label] of [
      ['Fashion', 'Fashion Drive, San Pedro Garza García'],
      ['Qualtia', 'Qualtia, Avenida Conductores, Monterrey'],
    ]) {
      await address.fill(query);
      await page.getByRole('option', { name: label, exact: true }).waitFor();
      await address.press('ArrowDown');
      await address.press('Enter');
      if (width < 900)
        await page.getByRole('button', { name: 'Dibujar zona en mapa', exact: true }).click();
      const pin = page.getByRole('img', { name: label, exact: true });
      await pin.waitFor({ state: 'visible' });
      assert.equal(await page.locator('.maplibregl-marker').count(), 1, 'replace address pin');
      const pinBox = await pin.boundingBox();
      const mapBox = await page.locator('canvas.maplibregl-canvas').boundingBox();
      assert.ok(
        Math.abs(pinBox.x + pinBox.width / 2 - mapBox.x - mapBox.width / 2) < 5,
        'selected address is centered horizontally',
      );
      assert.ok(
        Math.abs(pinBox.y + pinBox.height - mapBox.y - mapBox.height / 2) < 5,
        'pin tip marks selected address',
      );
      assert.equal(
        await pin.evaluate((element) => getComputedStyle(element).pointerEvents),
        'none',
        'reference pin must allow drawing through it',
      );
      await page.screenshot({ path: `${output}/address-pin-${query}-${theme}-${width}.png` });
      if (width < 900)
        await page.getByRole('button', { name: 'Datos de ruta', exact: true }).first().click();
      assert.equal(
        await page.getByRole('button', { name: 'Guardar', exact: true }).isDisabled(),
        true,
        'address selection does not create a polygon',
      );
    }
    await address.fill('');
    assert.equal(await page.locator('.maplibregl-marker').count(), 0, 'clear address removes pin');
    if (width < 900)
      await page.getByRole('button', { name: 'Dibujar zona en mapa', exact: true }).click();
    await page.screenshot({ path: `${output}/new-place-map-${theme}-${width}.png` });
    const canvas = await page.locator('canvas.maplibregl-canvas').boundingBox();
    const x = canvas.x + canvas.width / 2,
      y = canvas.y + canvas.height / 2;
    await captureCursor('pencil', x - 40, y - 40);
    for (const [dx, dy] of [
      [-40, -40],
      [40, -40],
      [40, 40],
    ]) {
      if (width < 900) {
        await page.touchscreen.tap(x + dx, y + dy);
        // Pace taps like the desktop clicks so rendered vertices can be hit.
        await page.waitForTimeout(150);
      } else await page.mouse.click(x + dx, y + dy, { delay: 120 });
    }
    if (width < 900) await page.touchscreen.tap(x - 40, y - 40);
    else await page.keyboard.press('Enter');
    await page.locator('.mapbox-gl-draw_polygon.active').waitFor({ state: 'hidden' });
    assert.doesNotMatch(
      await mapCursor(),
      /url\(/,
      'drawing completion restores the native cursor',
    );
    await page.screenshot({ path: `${output}/polygon-map-${theme}-${width}.png` });
    if (width < 900)
      await page.getByRole('button', { name: 'Datos de ruta', exact: true }).first().click();
    await page.getByLabel(/Nombre del lugar/).fill('Zona poligonal demo');
    assert.equal(
      await page.getByRole('button', { name: 'Guardar', exact: true }).isEnabled(),
      true,
      'a polygon and name are sufficient without address or entrance',
    );
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await page
      .getByText('Lugar guardado. Ya puedes elegirlo como origen o destino.', { exact: true })
      .waitFor();
    assert.match(savedPlaces.at(-1).area, /^POLYGON/);
    assert.equal(
      savedPlaces.at(-1).area.split(',').length,
      4,
      'three vertices and the closing point',
    );
    assert.equal(savedPlaces.at(-1).attributes.routePlace.address, '');
    assert.ok(Number.isFinite(savedPlaces.at(-1).attributes.routePlace.latitude));
    await page.getByLabel(/Nombre del lugar/).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/polygon-${theme}-${width}.png` });
    await page.getByRole('button', { name: 'Dibujar zona en mapa', exact: true }).click();
    await page.locator('.mapbox-gl-draw_polygon').waitFor();
    assert.equal(
      await page.locator('.mapbox-gl-draw_polygon.active').count(),
      0,
      'saved zones open for editing',
    );
    await page.screenshot({ path: `${output}/saved-zone-map-${theme}-${width}.png` });
    assert.doesNotMatch(await mapCursor(), /url\(/, 'editing saved vertices keeps native cursors');
    if (width < 900)
      await page.getByRole('button', { name: 'Datos de ruta', exact: true }).first().click();
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    assert.doesNotMatch(await mapCursor(), /url\(/, 'cancel restores the native cursor');
    assert.deepEqual(errors, []);
    assert.equal(writes, 3);
    readonly = true;
    status = 'planned';
    orders[0].attributes.routeTrip.status = status;
    await page.goto(`${base}/routes`);
    await page.getByRole('heading', { name: 'Viajes y lugares' }).waitFor();
    await page.getByRole('tab', { name: 'Viajes', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Nuevo viaje', exact: true }).count(), 0);
    await page.getByRole('button', { name: /Entrega demo/ }).click();
    const readonlyPreview = page.waitForResponse(
      (response) => response.url().endsWith('/api/routing'),
      { timeout: 3000 },
    );
    await page.getByRole('button', { name: 'Calcular ruta', exact: true }).click();
    await readonlyPreview;
    assert.equal(writes, 3, 'readonly route preview must not write');
    await page.getByRole('tab', { name: 'Lugares', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Nuevo lugar', exact: true }).count(), 0);
    await page.getByRole('combobox', { name: 'Geozonas guardadas', exact: true }).click();
    await page.getByRole('option', { name: 'Qualtia Conductores', exact: true }).click();
    assert.equal(await page.locator('.mapbox-gl-draw_polygon').count(), 0);
    assert.equal(await page.getByLabel(/Nombre del lugar/).isDisabled(), true);
    assert.doesNotMatch(await mapCursor(), /url\(/, 'readonly places have no picking cursor');
    assert.equal(writes, 3);
    readonly = false;
    searchEnabled = false;
    const previousSearches = searches;
    await page.goto(`${base}/routes`);
    await page.getByRole('tab', { name: 'Lugares', exact: true }).click();
    await page.getByRole('button', { name: 'Nuevo lugar', exact: true }).click();
    if (width < 900)
      await page.getByRole('button', { name: 'Datos de ruta', exact: true }).first().click();
    await page.getByRole('combobox', { name: 'Forma de la zona', exact: true }).click();
    await page.getByRole('option', { name: 'Círculo', exact: true }).click();
    await page.getByLabel(/Nombre del lugar/).fill('Lugar manual demo');
    await page
      .getByRole('combobox', { name: 'Dirección (opcional)', exact: true })
      .fill('Avenida Conductores');
    await page
      .getByText('La búsqueda de direcciones no está disponible. Puedes usar el mapa.', {
        exact: true,
      })
      .waitFor();
    await page.getByRole('button', { name: 'Coordenadas del centro', exact: true }).click();
    await page.getByRole('spinbutton', { name: 'Latitud del centro', exact: true }).fill('25.72');
    await page.getByRole('spinbutton', { name: 'Longitud del centro', exact: true }).fill('-100.3');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await page
      .getByText('Lugar guardado. Ya puedes elegirlo como origen o destino.', { exact: true })
      .waitFor();
    assert.equal(searches, previousSearches, 'disabled geocoder must not send searches');
    assert.equal(savedPlaces.at(-1).attributes.routePlace.latitude, 25.72);
    assert.match(savedPlaces.at(-1).area, /^CIRCLE \(25.72 -100.3,/);
    await page
      .locator('.MuiBottomNavigation-root')
      .getByRole('button', { name: 'Mapa', exact: true })
      .click();
    await page.waitForURL(`${base}/`);
    await page.getByRole('heading', { name: 'Viajes y lugares' }).waitFor({ state: 'hidden' });
    assert.doesNotMatch(await mapCursor(), /url\(/, 'route cursor must not leak into tracking');

    savedPlaces.push(
      {
        id: 100,
        name: 'Parada Santa Catarina',
        area: 'CIRCLE (25.66 -100.3, 150)',
        attributes: {},
      },
      { id: 101, name: 'Parada García', area: 'CIRCLE (25.68 -100.3, 150)', attributes: {} },
    );
    status = 'planned';
    await page.goto(`${base}/routes`);
    await page.getByRole('tab', { name: 'Viajes', exact: true }).click();
    await page.getByRole('button', { name: 'Nuevo viaje', exact: true }).click();
    await page.getByLabel(/Nombre del viaje/).fill('Viaje con paradas');
    for (const [label, option] of [
      ['Origen', 'Qualtia Conductores'],
      ['Destino', 'CEDIS Monterrey'],
      ['Unidad', 'Unidad 10'],
    ]) {
      await page.getByRole('combobox', { name: new RegExp(`^${label}`) }).click();
      await page.getByRole('option', { name: option, exact: true }).click();
    }
    for (const [index, name] of ['Parada Santa Catarina', 'Parada García'].entries()) {
      await page.getByRole('button', { name: 'Añadir parada', exact: true }).click();
      assert.equal(
        await page.getByRole('button', { name: 'Calcular ruta', exact: true }).isDisabled(),
        true,
      );
      await page.getByRole('combobox', { name: `Parada ${index + 1}`, exact: true }).click();
      await page.getByRole('option', { name, exact: true }).click();
    }
    const up = page.getByRole('button', { name: 'Subir parada 2', exact: true });
    await up.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      (id) => document.getElementById(id)?.value === 'Parada García',
      await page.getByRole('combobox', { name: 'Parada 1', exact: true }).getAttribute('id'),
    );
    assert.equal(
      await page.getByRole('combobox', { name: 'Parada 1', exact: true }).inputValue(),
      'Parada García',
    );
    await page.getByRole('button', { name: 'Bajar parada 1', exact: true }).click();
    await page.getByRole('button', { name: 'Quitar parada 2', exact: true }).click();
    assert.equal(await page.getByRole('combobox', { name: 'Parada 2', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Añadir parada', exact: true }).click();
    await page.getByRole('combobox', { name: 'Parada 2', exact: true }).click();
    await page.getByRole('option', { name: 'Parada García', exact: true }).click();
    await page.getByRole('combobox', { name: 'Inicio del viaje', exact: true }).click();
    await page
      .getByRole('option', { name: 'Al salir de la geozona de origen', exact: true })
      .click();
    await page.getByLabel(/Salida \(hora local\)/).fill('2026-10-09T08:30');
    const routingRequest = page.waitForRequest(
      (request) =>
        new URL(request.url()).pathname === '/api/routing' && request.method() === 'POST',
    );
    await page.getByRole('button', { name: 'Calcular ruta', exact: true }).click();
    const previewInput = (await routingRequest).postDataJSON();
    assert.deepEqual(previewInput.waypoints, [
      { latitude: 25.66, longitude: -100.3 },
      { latitude: 25.68, longitude: -100.3 },
    ]);
    assert.equal(previewInput.departureTime, new Date('2026-10-09T08:30').toISOString());
    await page.getByText(/^12.00 km$/i).waitFor();
    if (width > 900) {
      await page.waitForFunction(() =>
        ['Parada Santa Catarina', 'Parada García'].every((name) => {
          const marker = document.querySelector(`[role="img"][aria-label="${name}"]`);
          const box = marker?.getBoundingClientRect();
          return (
            box &&
            box.left >= 375 &&
            box.right <= innerWidth &&
            box.top >= 0 &&
            box.bottom <= innerHeight
          );
        }),
      );
    }
    await page.getByRole('combobox', { name: 'Parada 1', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/stops-form-${theme}-${width}.png` });
    await page
      .getByRole('combobox', { name: 'Inicio del viaje', exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/departure-form-${theme}-${width}.png` });
    await page.getByRole('button', { name: 'Crear viaje', exact: true }).click();
    await page.getByText('Esperando salida', { exact: true }).waitFor();
    assert.equal(orders[0].attributes.routeTrip.departureMode, 'origin');
    assert.deepEqual(
      orders[0].attributes.routeTrip.stops.map((stop) => stop.place.id),
      [100, 101],
    );
    assert.equal(await page.getByText(/Hasta la próxima llegada/).count(), 0);
    if (width > 900) {
      await page.waitForFunction(() => {
        const box = document
          .querySelector('[role="img"][aria-label="Parada Santa Catarina"]')
          ?.getBoundingClientRect();
        return box && box.top >= 0 && box.bottom <= innerHeight;
      });
    }
    await page.screenshot({ path: `${output}/departure-ready-${theme}-${width}.png` });
    status = 'active';
    orders[0].attributes.routeTrip.startedTime = new Date(Date.now() - 600000).toISOString();
    await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await page.getByText('Unidad 10 → Parada Santa Catarina', { exact: true }).waitFor();
    await page.getByText(/0 h 5 m · 5.00 km/i).waitFor();
    await page.getByText('Hasta la próxima llegada', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/next-stop-${theme}-${width}.png` });
    const arrivedStop = orders[0].attributes.routeTrip.stops[0];
    arrivedStop.arrivedTime = new Date(Date.now() - 300000).toISOString();
    arrivedStop.visit = {
      departedTime: null,
      lastInsideTime: new Date().toISOString(),
      uncertain: false,
    };
    await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await page.getByText('Unidad 10 → Parada García', { exact: true }).waitFor();
    const stopSection = page.getByRole('region', { name: 'Parada Santa Catarina', exact: true });
    await stopSection.getByText('En el lugar · salida pendiente', { exact: true }).waitFor();
    await stopSection.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/stop-arrived-${theme}-${width}.png` });
    arrivedStop.visit.departedTime = new Date().toISOString();
    await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await stopSection.getByText('Salida detectada', { exact: true }).first().waitFor();
    assert.equal(await stopSection.getByText('—', { exact: true }).count(), 0);
    await stopSection.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/stop-departed-${theme}-${width}.png` });
    arrivedStop.visit.uncertain = true;
    await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await stopSection.getByText('Observación incompleta', { exact: true }).waitFor();
    assert.equal(await stopSection.getByText('—', { exact: true }).count(), 1);
    await stopSection.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/stop-incomplete-${theme}-${width}.png` });
    stale = true;
    await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await page
      .getByText('Ubicación antigua. No se puede mostrar una llegada actual.', { exact: true })
      .waitFor();
    assert.equal(await page.getByText('Hasta la próxima llegada', { exact: true }).count(), 0);
    await page.getByRole('tab', { name: 'Calcular', exact: true }).click();
    assert.equal(await page.getByRole('tab', { name: 'Viajes', exact: true }).isVisible(), true);
    await page.getByRole('tab', { name: 'Unidad más cercana', exact: true }).click();
    assert.equal(await page.getByRole('tab', { name: 'Lugares', exact: true }).isVisible(), true);
    await page.getByRole('tab', { name: 'Viajes', exact: true }).click();
    await page.screenshot({ path: `${output}/tabs-${theme}-${width}.png` });
    summary.push({
      theme,
      width,
      checks:
        'observed-stop-stay/first-departure/incomplete-not-zero/visible-tabs/ordered-stops/add-remove-reorder/automatic-departure/local-departure-preview/named-next-stop/confirmed-stop-arrival/legacy-create/preview/start/ETA/stale/arrival/completion/circle/polygon/native-draw/touch-close/pin-pencil-cursors/cursor-cleanup/native-geofences/no-required-entrance/optional-address/collapsed-options/image/address/manual-fallback/visits/report-error/navigation/keyboard/readonly-preview',
    });
    await context.close();
    console.log('Passed', theme, width);
  }
  await writeFile(`${output}/checks.json`, JSON.stringify(summary, null, 2));
} catch (error) {
  if (lastPage && !lastPage.isClosed()) {
    console.log(await lastPage.locator('body').innerText());
    await lastPage.screenshot({ path: `${output}/failure.png` });
  }
  throw error;
} finally {
  await browser.close();
}
