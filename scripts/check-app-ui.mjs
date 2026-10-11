/* global console, process, URL, document, innerWidth, getComputedStyle, localStorage */
// Static frontend only. Every API request and WebSocket is intercepted before navigation.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:18766';
const output = process.env.SCREENSHOT_DIR || '/tmp/novatrack-app-ui';
await mkdir(output, { recursive: true });
const now = new Date().toISOString();
const user = {
  id: 1,
  name: 'Operador demo',
  email: 'demo@example.test',
  administrator: true,
  attributes: { language: 'es', speedUnit: 'kmh', distanceUnit: 'km' },
};
const devices = [
  {
    id: 1,
    name: 'Unidad 01 · Reparto Centro',
    uniqueId: 'demo-01',
    status: 'online',
    lastUpdate: now,
    category: 'truck',
    groupId: 1,
    attributes: {},
  },
];
const position = {
  id: 1,
  deviceId: 1,
  protocol: 'demo',
  valid: true,
  latitude: 19.4326,
  longitude: -99.1332,
  speed: 12,
  course: 0,
  altitude: 2200,
  accuracy: 0,
  fixTime: now,
  serverTime: now,
  deviceTime: now,
  attributes: { ignition: true, motion: true, batteryLevel: 85 },
};
const collections = {
  devices,
  users: [user],
  groups: [{ id: 1, name: 'Reparto', attributes: {} }],
  geofences: [{ id: 1, name: 'Centro', area: 'CIRCLE (19.4326 -99.1332, 1000)', attributes: {} }],
  drivers: [{ id: 1, name: 'Conductor demo', uniqueId: 'driver-demo', attributes: {} }],
  calendars: [],
  commands: [],
  notifications: [],
  maintenance: [],
  'attributes/computed': [],
  reports: [],
};
const routes = [
  '/',
  '/dashboard',
  '/reports/combined',
  '/reports/chart',
  '/reports/events',
  '/reports/geofences',
  '/reports/route',
  '/reports/stops',
  '/reports/summary',
  '/reports/video',
  '/reports/trips',
  '/reports/scheduled',
  '/reports/statistics',
  '/reports/audit',
  '/reports/logs',
  '/settings/preferences',
  '/settings/devices',
  '/settings/device',
  '/settings/device/1',
  '/settings/device/1/connections',
  '/settings/device/1/command',
  '/settings/users',
  '/settings/user',
  '/settings/user/1',
  '/settings/user/1/connections',
  '/settings/groups',
  '/settings/group',
  '/settings/group/1',
  '/settings/group/1/connections',
  '/settings/group/1/command',
  '/settings/drivers',
  '/settings/driver',
  '/settings/driver/1',
  '/settings/geofence',
  '/settings/geofence/1',
  '/settings/calendars',
  '/settings/calendar',
  '/settings/commands',
  '/settings/command',
  '/settings/attributes',
  '/settings/attribute',
  '/settings/maintenances',
  '/settings/maintenance',
  '/settings/notifications',
  '/settings/notification',
  '/settings/server',
  '/settings/announcement',
  '/settings/accumulators/1',
  '/settings/device/1/share',
  '/position/1',
  '/network/1',
  '/event/1',
  '/replay',
  '/geofences',
  '/emulator',
  '/stream?deviceId=1',
  '/login',
  '/register',
  '/reset-password',
  '/change-server',
];
const shots = new Set([
  '/',
  '/dashboard',
  '/reports/summary',
  '/reports/chart',
  '/settings/devices',
  '/settings/preferences',
  '/settings/user/1',
  '/settings/group/1',
  '/position/1',
  '/replay',
  '/geofences',
  '/stream?deviceId=1',
  '/login',
]);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ['--no-sandbox'],
});
const results = [];
try {
  await Promise.all(
    [
      ['light', 1440, 900],
      ['dark', 1440, 900],
      ['light', 390, 844],
      ['dark', 390, 844],
    ].map(async ([theme, width, height]) => {
      const context = await browser.newContext({
        viewport: { width, height },
        colorScheme: theme,
        serviceWorkers: 'block',
      });
      const mutations = [];
      let liveSocket;
      await context.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname.slice(5);
        let data;
        if (request.method() !== 'GET') {
          const body = request.postData();
          mutations.push({ path, method: request.method(), body });
          data = body?.startsWith('{') ? { ...JSON.parse(body), id: 1 } : {};
        } else if (path === 'server') {
          data = {
            id: 1,
            version: 'demo',
            registration: true,
            emailEnabled: true,
            latitude: 19.4326,
            longitude: -99.1332,
            zoom: 12,
            map: 'custom',
            mapUrl: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png',
            attributes: { language: 'es', activeMapStyles: 'custom' },
          };
        } else if (path === 'session') data = user;
        else if (path === 'positions')
          data = url.searchParams.has('from')
            ? Array.from({ length: 80 }, (_, i) => ({ ...position, id: i + 1 }))
            : [position];
        else if (path === 'reports/route') data = [position];
        else if (path === 'events/1')
          data = {
            id: 1,
            deviceId: 1,
            positionId: 1,
            type: 'deviceOnline',
            eventTime: now,
            attributes: {},
          };
        else if (path === 'reports/summary')
          data = [
            {
              deviceId: 1,
              startTime: now,
              distance: 12500,
              averageSpeed: 12,
              maxSpeed: 30,
              engineHours: 3600000,
            },
          ];
        else if (path === 'reports/combined') data = [];
        else if (path === 'stream/history/intervals') data = [];
        else if (path === 'server/timezones')
          data = [{ key: 'America/Mexico_City', name: 'Ciudad de México' }];
        else if (path === 'commands/types') data = [{ type: 'positionSingle' }];
        else if (path === 'notifications/types') data = [{ type: 'deviceOnline' }];
        else if (path.startsWith('notifications/notificators')) data = [{ type: 'web' }];
        else if (collections[path]) data = collections[path];
        else {
          const match = path.match(/^(.*)\/(\d+)$/);
          data =
            match && collections[match[1]]
              ? collections[match[1]].find((item) => item.id === Number(match[2])) || {
                  id: Number(match[2]),
                  name: 'Demo',
                  attributes: {},
                }
              : [];
        }
        await route.fulfill({ json: data });
      });
      await context.routeWebSocket('**/api/socket', (socket) => {
        liveSocket = socket;
        socket.onMessage(() => {});
        socket.send(JSON.stringify({ devices, positions: [position] }));
      });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      let errors = [];
      const failedRequests = [];
      page.on('requestfailed', (request) =>
        failedRequests.push({ url: request.url(), error: request.failure()?.errorText }),
      );
      page.on('pageerror', (error) => errors.push(error.message));
      for (const path of process.env.DASHBOARD_ONLY ? ['/dashboard'] : routes) {
        errors = [];
        await page.goto(base + path, { waitUntil: 'networkidle', timeout: 30000 });
        await page
          .waitForFunction(
            () =>
              document.querySelector('#root')?.textContent?.trim() &&
              (!document.querySelector('.MuiCircularProgress-root') ||
                document.location.pathname === '/stream'),
          )
          .catch(async (error) => {
            await page.screenshot({ path: `${output}/${width}-${theme}-failure.png` });
            throw new Error(
              `${path}: ${await page.locator('body').innerText()} | JS: ${JSON.stringify(errors)} | Network: ${JSON.stringify(failedRequests)}`,
              { cause: error },
            );
          });
        assert.equal(
          new URL(page.url()).pathname,
          new URL(base + path).pathname,
          `Unexpected redirect: ${path}`,
        );
        assert.deepEqual(errors, [], `${theme} ${width} ${path}: JavaScript errors`);
        assert.equal(
          await page.getByText('Something went wrong', { exact: false }).count(),
          0,
          path,
        );
        assert.equal(await page.getByText('404 Not Found', { exact: true }).count(), 0, path);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
          `Page overflow: ${path}`,
        );
        if (path.startsWith('/settings/') || path.startsWith('/reports/')) {
          const footer = page.locator('.MuiBottomNavigation-root');
          await footer.waitFor();
          assert.equal(await footer.count(), 1, `Duplicate footer: ${path}`);
          const selected = path.startsWith('/reports/')
            ? 'Reportes'
            : path === '/settings/user/1'
              ? 'Cuenta'
              : 'Ajustes';
          assert.equal(await footer.locator('button.Mui-selected').innerText(), selected, path);
          const bounds = await footer.boundingBox();
          if (width >= 900) {
            const sidebar = page.locator('.MuiDrawer-paper');
            assert.equal(await sidebar.locator('.MuiBottomNavigation-root').count(), 1, path);
            const panel = await sidebar.boundingBox();
            assert.ok(Math.abs(bounds.width - panel.width) < 2, `Navigation width: ${path}`);
            assert.ok(Math.abs(bounds.y + bounds.height - panel.y - panel.height) < 2, path);
          } else {
            assert.ok(Math.abs(bounds.y + bounds.height - height) < 2, path);
          }
          for (const button of await page.locator('.MuiFab-root').all()) {
            const buttonBounds = await button.boundingBox();
            assert.ok(
              buttonBounds.y + buttonBounds.height <= bounds.y ||
                buttonBounds.x >= bounds.x + bounds.width ||
                buttonBounds.x + buttonBounds.width <= bounds.x,
              `Add button overlaps footer: ${path}`,
            );
          }
          await page
            .getByRole('heading', { level: 1 })
            .waitFor()
            .catch(async (error) => {
              throw new Error(`${path}: ${await page.locator('body').innerText()}`, {
                cause: error,
              });
            });
          assert.ok((await page.getByRole('heading', { level: 1 }).innerText()).trim(), path);
          assert.equal(
            await page.getByRole('heading', { level: 1 }).count(),
            1,
            `Missing page title: ${path}`,
          );
        }
        await page
          .waitForFunction(
            () => getComputedStyle(document.documentElement).scrollbarColor !== 'auto',
          )
          .catch(async (error) => {
            throw new Error(`${theme} ${width} ${path}: scrollbar theme missing`, { cause: error });
          });
        const scrollbar = await page.evaluate(
          () => getComputedStyle(document.documentElement).scrollbarColor,
        );
        assert.notEqual(scrollbar, 'auto', `Unthemed scrollbar: ${path}`);
        if (theme === 'dark')
          assert.ok(scrollbar.includes('rgb(33, 33, 33)'), `White scrollbar track: ${path}`);
        assert.equal(await page.locator('[role=alert] code').count(), 0, `Render error: ${path}`);
        if (path.startsWith('/stream')) {
          await page.getByText('Conectando cámara', { exact: true }).waitFor();
          assert.equal(await page.getByText('Error en la conexión').count(), 0);
          assert.equal(
            await page.locator('video').evaluate((video) => getComputedStyle(video).visibility),
            'hidden',
          );
        }
        if (shots.has(path))
          await page.screenshot({
            path: `${output}/${width}-${theme}-${path.split('?')[0].replaceAll('/', '_').slice(1)}.png`,
          });
        if (path.startsWith('/stream')) {
          await page.locator('video').dispatchEvent('playing');
          await page.waitForFunction(
            () => getComputedStyle(document.querySelector('video')).visibility === 'visible',
          );
          await page.getByRole('button', { name: 'Pausar visualización' }).focus();
          await page.keyboard.press('Enter');
          assert.equal(await page.locator('video').count(), 0);
          await page.getByRole('button', { name: 'Reanudar visualización' }).click();
          await page.getByText('Conectando cámara', { exact: true }).waitFor();
          assert.equal(
            await page.locator('video').evaluate((video) => getComputedStyle(video).visibility),
            'hidden',
          );
        }
        results.push({ theme, width, path, scrollbar, status: 'pass' });
        process.stdout.write(`${theme} ${width} ${path} OK\n`);
      }
      // The same footer connects reports, settings and the map on every viewport.
      await page.goto(base + '/reports/summary', { waitUntil: 'networkidle' });
      const footer = page.locator('.MuiBottomNavigation-root');
      await footer.getByRole('button', { name: 'Mapa', exact: true }).focus();
      await page.keyboard.press('Enter');
      await page.waitForURL(base + '/');
      await footer.getByRole('button', { name: 'Reportes', exact: true }).click();
      await page.waitForURL('**/reports/combined**');
      await footer.getByRole('button', { name: 'Ajustes', exact: true }).click();
      await page.waitForURL('**/settings/preferences?menu=true');
      if (width < 900) {
        await page.getByRole('dialog').waitFor();
        await page.getByRole('dialog').press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
      } else {
        await page.getByRole('heading', { name: 'Preferencias', exact: true }).waitFor();
      }
      await footer.getByRole('button', { name: 'Reportes', exact: true }).click();
      await page.waitForURL('**/reports/combined**');
      assert.equal(await footer.count(), 1);
      // Dashboard filters must use fresh motion and preserve the report selection.
      await page.goto(base + '/dashboard?deviceId=1', { waitUntil: 'networkidle' });
      await page.getByRole('heading', { name: 'Tu flota, de un vistazo' }).waitFor();
      const newFixTime = new Date(Date.now() + 20000);
      await page.clock.install({ time: newFixTime });
      liveSocket.send(
        JSON.stringify({ positions: [{ ...position, fixTime: newFixTime.toISOString() }] }),
      );
      await page.getByRole('button', { name: 'En movimiento 1', exact: true }).waitFor();
      await page.getByRole('button', { name: 'En movimiento 1', exact: true }).focus();
      await page.keyboard.press('Enter');
      assert.equal(
        await page
          .getByRole('button', { name: 'En movimiento 1', exact: true })
          .getAttribute('aria-pressed'),
        'true',
      );
      await page.getByRole('textbox', { name: 'Buscar', exact: true }).fill('inexistente');
      await page
        .getByText('No hay unidades que coincidan con estos filtros.', { exact: true })
        .waitFor();
      await page.getByRole('textbox', { name: 'Buscar', exact: true }).fill('');
      await page.getByRole('button', { name: 'Mostrar', exact: true }).click();
      await page
        .getByText('12.50 Km', { exact: true })
        .waitFor()
        .catch(async (error) => {
          await page.screenshot({ path: `${output}/${width}-${theme}-dashboard-failure.png` });
          throw new Error(
            `Dashboard workflow: ${await page.locator('body').innerText()} | JS: ${JSON.stringify(errors)}`,
            { cause: error },
          );
        });
      await page.getByText('1 h 0 m', { exact: true }).waitFor();
      assert.equal(new URL(page.url()).searchParams.get('deviceId'), '1');
      await page.getByText('Unidades en el resumen', { exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/${width}-${theme}-dashboard-results.png` });
      await page.getByRole('button', { name: 'Ver resumen y exportar', exact: true }).click();
      await page.waitForURL('**/reports/summary?**');
      assert.equal(new URL(page.url()).searchParams.get('deviceId'), '1');
      assert.equal(new URL(page.url()).searchParams.get('daily'), 'false');
      await page.getByRole('columnheader', { name: 'Velocidad máxima', exact: true }).waitFor();
      await page.getByRole('columnheader', { name: 'Horas motor', exact: true }).waitFor();
      // An error must not leave stale totals, and retry must make the real view recover.
      const summaryPattern = '**/api/reports/summary?**';
      await context.route(summaryPattern, (route) =>
        route.fulfill({ status: 503, body: 'Synthetic failure' }),
      );
      await page.goto(
        base + '/dashboard?deviceId=1&from=2026-10-06T00:00:00Z&to=2026-10-07T00:00:00Z',
        { waitUntil: 'networkidle' },
      );
      await page.getByRole('button', { name: 'Reintentar', exact: true }).waitFor();
      assert.equal(await page.getByText('12.50 Km', { exact: true }).count(), 0);
      await context.unroute(summaryPattern);
      await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
      await page.getByText('12.50 Km', { exact: true }).waitFor();
      await context.route(summaryPattern, (route) => route.fulfill({ json: [] }));
      await page.goto(
        base + '/dashboard?deviceId=1&from=2026-10-06T00:00:00Z&to=2026-10-07T00:00:00Z',
        { waitUntil: 'networkidle' },
      );
      await page
        .getByText(
          'No hay resultados para esta selección y período. Esto no demuestra cero actividad.',
          { exact: true },
        )
        .waitFor();
      await context.unroute(summaryPattern);
      assert.deepEqual(errors, [], 'Dashboard runtime errors');

      // Meaningful workflows, all writes stay inside this synthetic API handler.
      await page.goto(base + '/reports/summary?deviceId=1', { waitUntil: 'networkidle' });
      await page.goto(base + '/settings/group/1', { waitUntil: 'networkidle' });
      await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Reparto actualizado');
      await page.getByRole('button', { name: 'Guardar', exact: true }).click();
      await page.waitForURL(base + '/reports/summary?deviceId=1');
      assert.ok(
        mutations.some(
          (m) =>
            m.path === 'groups/1' &&
            m.method === 'PUT' &&
            JSON.parse(m.body).name === 'Reparto actualizado',
        ),
      );
      await page.goto(base + '/reports/summary?deviceId=1', { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Mostrar', exact: true }).click();
      await page.getByRole('cell', { name: 'Unidad 01 · Reparto Centro', exact: true }).waitFor();
      await page.screenshot({ path: `${output}/${width}-${theme}-summary-results.png` });
      await page.getByRole('combobox', { name: 'Período', exact: true }).click();
      await page.getByRole('option', { name: 'Personalizado', exact: true }).click();
      await page.getByLabel('Desde', { exact: true }).waitFor();
      await page.getByLabel('Hasta', { exact: true }).waitFor();
      if (width < 900) {
        await page.locator('button[aria-label="Reportes"][aria-expanded]').click();
        await page.getByRole('link', { name: 'Resumen', exact: true }).click();
        await page
          .getByRole('navigation', { name: 'Reportes', exact: true })
          .waitFor({ state: 'hidden' });
      } else {
        await page.locator('button[aria-label="Reportes"][aria-expanded]').click();
        await page.getByRole('link', { name: 'Resumen', exact: true }).waitFor();
        const compact = page.locator('.MuiDrawer-paper .MuiBottomNavigation-root');
        assert.equal(await compact.getByRole('button').count(), 6);
        const compactBounds = await compact.boundingBox();
        console.log('Collapsed navigation bounds before transition settles:', compactBounds);
        await page.waitForFunction(() => {
          const panel = document.querySelector('.MuiDrawer-paper');
          return panel?.getBoundingClientRect().width <= 73;
        });
        const settledBounds = await compact.boundingBox();
        console.log('Collapsed navigation bounds after transition:', settledBounds);
        assert.ok(settledBounds.width <= 73 && settledBounds.height >= 264);
        await page.screenshot({ path: `${output}/${width}-${theme}-sidebar-collapsed.png` });
        await compact.getByRole('button', { name: 'Rutas', exact: true }).focus();
        await page.keyboard.press('Enter');
        await page.waitForURL(base + '/routes');
        await page.getByRole('heading', { name: 'Viajes y lugares' }).waitFor();
        await page.getByRole('tab', { name: 'Calcular', exact: true }).click();
        await page.getByRole('heading', { name: 'Planificador de rutas' }).waitFor();
      }
      // Keep long reports printable; public/styles.css must release every scroll container.
      await page.goto(base + '/reports/route?deviceId=1', { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Mostrar', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 80);
      await page.emulateMedia({ media: 'print' });
      const clipped = await page.locator('table').evaluate((element) => {
        const containers = [];
        for (let node = element; node; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (
            node.scrollHeight > node.clientHeight + 1 &&
            ['auto', 'hidden', 'scroll'].includes(style.overflowY)
          )
            containers.push(node.tagName);
        }
        return containers;
      });
      assert.deepEqual(clipped, [], 'Print scroll containers clip report');
      assert.equal(
        await page.locator('.MuiBottomNavigation-root:visible').count(),
        0,
        'Footer printed',
      );
      await page.emulateMedia({ media: 'screen' });
      await page.goto(base + '/reports/stops?deviceId=1', { waitUntil: 'networkidle' });
      await page.getByRole('columnheader', { name: 'Duración', exact: true }).waitFor();
      await page.getByRole('columnheader', { name: 'Horas motor', exact: true }).waitFor();
      await page.evaluate(() =>
        localStorage.setItem('summaryColumns', JSON.stringify(['distance'])),
      );
      await page.goto(base + '/reports/summary?deviceId=1', { waitUntil: 'networkidle' });
      await page.getByRole('columnheader', { name: 'Distancia', exact: true }).waitFor();
      assert.equal(
        await page.getByRole('columnheader', { name: 'Horas motor', exact: true }).count(),
        0,
      );
      await context.route('**/api/session', (route) =>
        route.fulfill({ json: { ...user, administrator: false, disableReports: true } }),
      );
      let prohibitedReports = 0;
      await context.route('**/api/reports/**', (route) => {
        prohibitedReports += 1;
        return route.fulfill({ status: 403, body: 'Restricted fixture' });
      });
      await page.goto(
        base + '/dashboard?deviceId=1&from=2026-10-06T00:00:00Z&to=2026-10-07T00:00:00Z',
        { waitUntil: 'networkidle' },
      );
      await page.getByRole('heading', { name: 'Tu flota, de un vistazo' }).waitFor();
      assert.equal(
        await page.getByRole('heading', { name: 'Actividad del período', exact: true }).count(),
        0,
      );
      assert.equal(prohibitedReports, 0, 'Restricted dashboard must not request reports');
      await context.close();
      process.stdout.write(
        `${width} ${theme}: ${process.env.DASHBOARD_ONLY ? 1 : routes.length} routes and save/report/navigation/80-row print checks OK\n`,
      );
    }),
  );
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2) + '\n');
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2) + '\n');
  await browser.close();
}
