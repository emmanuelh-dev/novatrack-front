/* global process, console, URL, URLSearchParams, document, requestAnimationFrame, setTimeout */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:18771';
const output = process.env.SCREENSHOT_DIR || '/tmp/anacondda-operations-ui';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ['--no-sandbox'],
});
const iso = (offset) => new Date(Date.now() + offset).toISOString();
const places = [1, 2].map((id) => ({
  id,
  name: id === 1 ? 'Qualtia Conductores' : 'CEDIS Monterrey',
  area: `CIRCLE (${25.7 + id * 0.01} -100.3, 150)`,
  attributes: {},
}));
const devices = [10, 20, 30, 40, 50].map((id) => ({
  id,
  name: `Unidad ${id}`,
  uniqueId: `demo-${id}`,
  status: 'online',
  attributes: {},
}));
const makeOrders = () =>
  [
    ['Entrega puntual', 'arrived', 0, 10],
    ['Entrega tardía', 'completed', 600000, 20],
    ['Cancelado demo', 'cancelled', 600000, 10],
    ['Sin llegada', 'active', null, 10],
    ['No autorizado', 'arrived', 0, 99],
  ].map(([name, status, delay, deviceId], i) => ({
    id: i + 1,
    description: name,
    attributes: {
      routeTrip: {
        version: 1,
        deviceId,
        status,
        origin: { name: places[0].name },
        destination: { name: places[1].name },
        request: { departureTime: iso(-7200000) },
        plannedArrival: iso(-3600000),
        startedTime: iso(-7200000),
        arrivedTime: delay === null ? null : iso(-3600000 + delay),
        completedTime: status === 'completed' ? iso(-1200000) : null,
        stops: [
          {
            place: { id: 3, name: 'Planta intermedia' },
            arrivedTime: delay === null ? null : iso(-5700000),
          },
        ],
      },
      ...(i < 2
        ? {
            routeVisits: {
              0: { departedTime: iso(-4800000), lastInsideTime: iso(-5100000), uncertain: i === 1 },
            },
          }
        : {}),
    },
  }));
const until = async (condition) => {
  for (let i = 0; i < 1000; i++) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Synthetic request did not arrive');
};
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
      serviceWorkers: 'block',
      acceptDownloads: true,
    });
    let socket,
      routeMode = 'ok',
      ordersFail = false,
      readonly = false,
      disableReports = false,
      routeCalls = 0,
      reportCalls = 0,
      orderCalls = 0,
      reportMode = 'ok',
      resumeRoute,
      resumeReport;
    let positions = [10, 20, 30, 40, 50, 99].map((id) => ({
      id,
      deviceId: id,
      valid: id !== 40,
      latitude: id === 20 ? 25.85 : id === 10 ? 25.69 : 25.7,
      longitude: -100.3,
      fixTime: iso(id === 30 ? -600000 : id === 50 ? 600000 : -60000),
      attributes: { motion: false, ignition: true },
    }));
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(base).origin) return route.abort();
      if (url.pathname.startsWith('/empty-tile/'))
        return route.fulfill({
          contentType: 'image/png',
          body: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQzQAAAAASUVORK5CYII=',
            'base64',
          ),
        });
      if (!url.pathname.startsWith('/api/')) return route.continue();
      const path = url.pathname.slice(5);
      let json = [];
      if (path === 'server')
        json = {
          id: 1,
          routingEnabled: true,
          routingSearchEnabled: false,
          map: 'custom',
          mapUrl: `${base}/empty-tile/{z}/{x}/{y}.png`,
          attributes: { language: 'es', activeMapStyles: 'custom' },
        };
      if (path === 'session')
        json = {
          id: 1,
          readonly,
          disableReports,
          name: 'Operador demo',
          attributes: { language: 'es' },
        };
      if (path === 'devices') json = devices;
      if (path === 'positions') json = positions;
      if (path === 'geofences') json = places;
      if (path === 'orders') {
        orderCalls++;
        if (ordersFail) return route.fulfill({ status: 500, json: { code: 'ERROR' } });
        json = makeOrders();
      }
      if (path === 'routing') {
        routeCalls++;
        const request = route.request().postDataJSON();
        assert.equal(request.profile, 'car');
        assert.ok(request.origin.latitude >= 25.69);
        assert.ok(request.destination.latitude > 25.7);
        if (routeMode === 'delay')
          await new Promise((resolve) => {
            resumeRoute = resolve;
          });
        if (routeMode === 'error')
          return route.fulfill({ status: 400, json: { code: 'NO_ROUTE' } });
        json = {
          distance: 12000,
          duration: 900,
          arrivalTime: iso(900000),
          geometry: {
            type: 'LineString',
            coordinates: [
              [-100.3, request.origin.latitude],
              [-100.3, request.destination.latitude],
            ],
          },
        };
      }
      if (path === 'reports/activity') {
        reportCalls++;
        if (reportMode === 'delay')
          await new Promise((resolve) => {
            resumeReport = resolve;
          });
        if (reportMode === 'error')
          return route.fulfill({ status: 400, body: 'Synthetic invalid period' });
        const ids = url.searchParams.getAll('deviceId').map(Number);
        json = (ids.length ? ids : [10, 20, 30, 40]).map((id) => ({
          deviceId: id,
          deviceName: `Unidad ${id}`,
          observedMillis: id === 30 ? 0 : 3600000,
          stoppedMillis: id === 30 || id === 40 ? 0 : 1200000,
          idleMillis: id === 20 || id === 30 || id === 40 ? 0 : 600000,
          ignitionUnknownMillis: id === 20 ? 3600000 : 0,
          motionUnknownMillis: id === 40 ? 3600000 : 0,
          outsidePlacesMillis: url.searchParams.has('geofenceId')
            ? id === 30 || id === 40
              ? 0
              : 300000 * url.searchParams.getAll('geofenceId').length
            : null,
          uncoveredMillis: id === 30 ? 7200000 : 3600000,
          positionCount: id === 30 ? 0 : 60,
        }));
      }
      return route.fulfill({ json }).catch(() => {});
    });
    await context.routeWebSocket('**/api/socket', (ws) => {
      socket = ws;
      ws.send(JSON.stringify({ devices, positions }));
      ws.onMessage(() => {});
    });
    const page = await context.newPage();
    lastPage = page;
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const screenshot = (name) =>
      page.screenshot({ path: `${output}/${name}-${theme}-${width}.png` });
    const noOverflow = async () =>
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        ),
        'page must contain horizontal scrolling',
      );
    await page.goto(`${base}/routes`);
    await page.getByRole('tab', { name: 'Unidad más cercana', exact: true }).click();
    assert.equal(
      await page.getByRole('spinbutton', { name: 'Latitud', exact: true }).isVisible(),
      false,
    );
    await page.getByRole('combobox', { name: 'Destino', exact: true }).click();
    await page.getByRole('option', { name: 'Qualtia Conductores', exact: true }).click();
    await page
      .getByText('2 de 5 unidades accesibles tienen GPS reciente.', { exact: true })
      .waitFor();
    const list = page.getByRole('list', { name: 'Unidad más cercana' });
    assert.deepEqual(await list.getByRole('button').allTextContents(), [
      'Unidad 102.22 Km · línea recta',
      'Unidad 2015.57 Km · línea recta',
    ]);
    if (width >= 900) {
      const canvas = page.locator('.maplibregl-canvas');
      await canvas.waitFor({ state: 'visible' });
      const bounds = await canvas.boundingBox();
      const mercatorY = (latitude) =>
        (1 -
          Math.log(
            Math.tan((latitude * Math.PI) / 180) + 1 / Math.cos((latitude * Math.PI) / 180),
          ) /
            Math.PI) /
        2;
      const x = bounds.x + bounds.width / 2;
      const y =
        bounds.y + bounds.height / 2 + (mercatorY(25.69) - mercatorY(25.71)) * 512 * 2 ** 10;
      for (let i = 0; i < 40; i++) {
        await page.mouse.move(x + (i % 2), y);
        if (await canvas.evaluate((element) => element.style.cursor === 'pointer')) break;
        await page.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
      }
      assert.equal(
        await canvas.evaluate((element) => element.style.cursor),
        'pointer',
        'click test must hit the vehicle marker',
      );
      await page.mouse.click(x, y);
      assert.equal(
        await page.getByLabel('Latitud', { exact: true }).inputValue(),
        '25.71',
        'unit marker click must preserve destination',
      );
      await page
        .getByRole('button', { name: 'Calcular recorrido por carretera', exact: true })
        .waitFor();
    }
    await list.getByRole('button', { name: /Unidad 10/ }).click();
    await page
      .getByRole('button', { name: 'Calcular recorrido por carretera', exact: true })
      .click();
    await page.getByText(/^12.00 km$/i).waitFor();
    await page.getByText(/^12.00 km$/i).scrollIntoViewIfNeeded();
    await screenshot('nearest-route');
    await noOverflow();
    positions = positions.map((position) =>
      position.deviceId === 10 ? { ...position, latitude: 25.705, fixTime: iso(-30000) } : position,
    );
    socket.send(JSON.stringify({ positions }));
    await page.getByText(/^12.00 km$/i).waitFor({ state: 'hidden' });
    routeMode = 'delay';
    await page
      .getByRole('button', { name: 'Calcular recorrido por carretera', exact: true })
      .click();
    await page.waitForFunction(() => true);
    await until(() => resumeRoute);
    await page.getByRole('button', { name: 'Coordenadas', exact: true }).click();
    await page.getByRole('spinbutton', { name: 'Latitud', exact: true }).fill('25.72');
    resumeRoute();
    routeMode = 'ok';
    await list.getByRole('button', { name: /Unidad 20/ }).click();
    routeMode = 'error';
    await page
      .getByRole('button', { name: 'Calcular recorrido por carretera', exact: true })
      .click();
    await page
      .getByText(
        'No se encontró una ruta vial para estos puntos y vehículo. Prueba puntos en vías accesibles cercanas.',
        { exact: true },
      )
      .waitFor();
    assert.equal(await page.getByText(/^12.00 km$/i).count(), 0);
    routeMode = 'ok';
    if (width < 900) {
      await page.getByRole('button', { name: 'Mapa', exact: true }).first().click();
      await screenshot('nearest-map');
      await page.getByRole('button', { name: 'Datos de ruta', exact: true }).click();
    }
    assert.equal(
      await page.getByRole('tab', { name: 'Comparativo de viajes', exact: true }).count(),
      0,
    );
    await page.getByRole('button', { name: 'Reportes', exact: true }).last().click();
    if (width < 900)
      await page
        .locator('.MuiAppBar-root')
        .getByRole('button', { name: 'Reportes', exact: true })
        .click();
    await page.getByRole('link', { name: 'Comparativo de viajes', exact: true }).click();
    await page.waitForURL('**/reports/trip-comparison');
    const region = page.locator('div[role="region"][aria-label="Comparativo de viajes"]');
    await region.getByRole('cell', { name: 'Entrega puntual', exact: true }).waitFor();
    assert.equal(await region.getByRole('cell', { name: 'No autorizado', exact: true }).count(), 0);
    assert.equal(await region.getByRole('row').count(), 5);
    await region.focus();
    assert.equal(await region.evaluate((element) => element === document.activeElement), true);
    if (width < 900) {
      const fields = await page.getByLabel(/Desde · Salida programada/).boundingBox();
      assert.ok(fields.width > 250, 'Mobile date filter must be readable');
    }
    await page
      .getByRole('heading', { name: 'Comparativo de viajes', exact: true })
      .last()
      .scrollIntoViewIfNeeded();
    await screenshot('trip-comparison');
    await noOverflow();
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.getByRole('tablist', { name: 'Viajes y lugares' }).count(), 0);
    assert.equal(await page.locator('.MuiBottomNavigation-root').isVisible(), false);
    assert.equal(
      await region.isVisible(),
      true,
      'The comparison remains printable without navigation',
    );
    await page.emulateMedia({ media: 'screen' });
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar · Excel', exact: true }).click();
    const download = await downloaded;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await readFile(await download.path()));
    const xlsx = JSON.stringify(workbook.worksheets[0].getSheetValues());
    assert.ok(
      xlsx.includes('Entrega puntual') &&
        xlsx.includes('Entrega tardía') &&
        !xlsx.includes('No autorizado'),
    );
    await page.getByRole('combobox', { name: 'Mostrar', exact: true }).click();
    await page.getByRole('option', { name: 'Paradas y permanencia', exact: true }).click();
    await page.locator('.MuiPopover-root').waitFor({ state: 'detached' });
    await region
      .getByRole('columnheader', { name: 'Permanencia observada', exact: true })
      .waitFor();
    assert.equal(
      await region.getByRole('row').count(),
      9,
      'Each authorized trip has a stop and destination',
    );
    assert.ok(
      await region.getByRole('cell', { name: 'Observación incompleta', exact: true }).count(),
    );
    assert.ok(await region.getByRole('cell', { name: 'Salida sin registro', exact: true }).count());
    const departed = region
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: 'Salida detectada', exact: true }) });
    assert.equal(await departed.count(), 1);
    assert.ok(await departed.getByRole('cell', { name: '0 h 15 m', exact: true }).isVisible());
    const incomplete = region
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: 'Observación incompleta', exact: true }) });
    assert.equal(
      await incomplete.getByRole('cell', { name: '—', exact: true }).count(),
      1,
      'Incomplete stay is not zero',
    );
    await region.focus();
    assert.equal(await region.evaluate((element) => element === document.activeElement), true);
    if (width < 900)
      await region.evaluate((element) => {
        element.scrollLeft = element.querySelectorAll('th')[2].offsetLeft;
      });
    await screenshot('trip-stop-report');
    await noOverflow();
    const visitsDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar · Excel', exact: true }).click();
    const visitsFile = await visitsDownload;
    const visitsWorkbook = new ExcelJS.Workbook();
    await visitsWorkbook.xlsx.load(await readFile(await visitsFile.path()));
    const visitsXlsx = JSON.stringify(visitsWorkbook.worksheets[0].getSheetValues());
    assert.ok(
      visitsXlsx.includes('Planta intermedia') &&
        visitsXlsx.includes('Observación incompleta') &&
        !visitsXlsx.includes('No autorizado'),
    );
    assert.equal(visitsFile.suggestedFilename(), 'trip-visits.xlsx');
    await page.getByLabel(/Desde · Salida programada/).fill('2030-01-01T00:00');
    assert.equal(await region.count(), 0);
    await page
      .getByText('Elige un período válido con el final posterior al inicio.', { exact: true })
      .waitFor();
    await page.goto(`${base}/reports/trip-comparison`);
    await region.getByRole('cell', { name: 'Entrega puntual', exact: true }).waitFor();
    ordersFail = true;
    await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await page
      .getByText(
        'No pudimos cargar o actualizar los viajes. Reintenta; los resultados visibles corresponden a la carga anterior.',
        { exact: true },
      )
      .waitFor();
    assert.equal(
      await region.getByRole('cell', { name: 'Entrega puntual', exact: true }).count(),
      1,
      'Failed refresh preserves the previous results',
    );
    ordersFail = false;
    const query = new URLSearchParams({ from: iso(-7200000), to: iso(0), deviceId: 'all' });
    await page.goto(`${base}/reports/activity?${query}`);
    const activity = page.getByRole('table', { name: 'Detenciones y ralentí', exact: true });
    await activity.getByRole('cell', { name: 'Unidad 10', exact: true }).waitFor();
    const unknown = activity
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: 'Unidad 20', exact: true }) });
    assert.ok((await unknown.innerText()).includes('Encendido incierto'));
    const noGps = activity
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: /^Unidad 30/ }) });
    assert.ok((await noGps.innerText()).includes('Cobertura GPS insuficiente'));
    const unknownMotion = activity
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: 'Unidad 40', exact: true }) });
    assert.ok((await unknownMotion.innerText()).includes('Movimiento incierto'));
    await screenshot('activity');
    await noOverflow();
    const activityRegion = page.getByRole('region', { name: 'Detenciones y ralentí', exact: true });
    await activityRegion.focus();
    assert.equal(
      await activityRegion.evaluate((element) => element === document.activeElement),
      true,
    );
    reportMode = 'delay';
    resumeReport = null;
    await page
      .getByRole('combobox', { name: 'Lugares de trabajo (opcional)', exact: true })
      .click();
    await page.getByRole('option', { name: 'Qualtia Conductores', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Mostrar', exact: true }).click();
    await until(() => resumeReport);
    reportMode = 'ok';
    await page
      .getByRole('combobox', { name: 'Lugares de trabajo (opcional)', exact: true })
      .click();
    await page.getByRole('option', { name: 'CEDIS Monterrey', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Mostrar', exact: true }).click();
    await activity.getByRole('cell', { name: 'Unidad 10', exact: true }).waitFor();
    resumeReport();
    assert.ok(new URL(page.url()).searchParams.getAll('geofenceId').includes('2'));
    const latestRow = activity
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: 'Unidad 10', exact: true }) });
    await latestRow.getByRole('cell').nth(6).getByText('0 h 10 m', { exact: true }).waitFor();
    await screenshot('activity-places');
    reportMode = 'error';
    await page.getByRole('button', { name: 'Mostrar', exact: true }).click();
    await page
      .getByText(
        'No se pudo cargar el reporte. Revisa el acceso a unidades y lugares y elige un período válido de hasta 31 días.',
        { exact: true },
      )
      .waitFor();
    assert.equal(await activity.getByRole('cell', { name: 'Unidad 10', exact: true }).count(), 0);
    reportMode = 'ok';
    await page.goto(`${base}/reports/activity`);
    assert.equal(await activity.getByRole('cell', { name: 'Unidad 10', exact: true }).count(), 0);
    readonly = true;
    await page.goto(`${base}/routes`);
    await page.getByRole('tab', { name: 'Viajes', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Nuevo viaje', exact: true }).count(), 0);
    await page.getByRole('tab', { name: 'Unidad más cercana', exact: true }).click();
    await page.getByRole('heading', { name: 'Unidad más cercana', exact: true }).waitFor();
    disableReports = true;
    await page.goto(`${base}/routes`);
    await page.getByRole('tab', { name: 'Viajes', exact: true }).waitFor();
    assert.equal(
      await page.getByRole('tab', { name: 'Comparativo de viajes', exact: true }).count(),
      0,
    );
    const beforeRestricted = orderCalls;
    await page.goto(`${base}/reports/trip-comparison`);
    await page.getByText('Tu cuenta no tiene acceso a reportes.', { exact: true }).waitFor();
    assert.equal(
      await page.getByRole('link', { name: 'Comparativo de viajes', exact: true }).count(),
      0,
    );
    assert.equal(orderCalls, beforeRestricted, 'Restricted report must not request orders');
    assert.deepEqual(errors, []);
    summary.push({
      theme,
      width,
      routeCalls,
      reportCalls,
      checks:
        'nearest-authorized/fresh/order/route/stale-invalidate/abort/error/mobile-map; trip-authorized/timing/stop-stay/separate-observations/incomplete-not-zero/legacy/keyboard/export/invalid-period/refresh-error; activity/no-gps/ignition/motion/filter-race/error/clear/keyboard; readonly/report-restriction',
    });
    await context.close();
    console.log('PASS', theme, width);
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
