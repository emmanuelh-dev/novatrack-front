/* global console, AbortController, Response */
import assert from 'node:assert/strict';
import { extendTollCapability } from '../src/common/util/serverCapabilities.js';

const originalFetch = globalThis.fetch;
let calls = 0;
const signal = new AbortController().signal;
try {
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, '/api/routing/tolls/status');
    assert.ok(options.signal);
    return Response.json({ enabled: true, catalog: true });
  };
  const native = { id: 1, routingTollsEnabled: true, routingTollsCatalogEnabled: true };
  assert.equal(await extendTollCapability(native, signal), native);
  assert.equal(calls, 0);
  const legacy = { id: 2, routingEnabled: true };
  assert.deepEqual(await extendTollCapability(legacy, signal), {
    ...legacy,
    routingTollsEnabled: true,
    routingTollsCatalogEnabled: true,
  });
  assert.equal(legacy.routingTollsEnabled, undefined, 'preserve original object');
  for (const response of [
    Response.json({ enabled: true }, { status: 503 }),
    new Response('not json', { status: 404 }),
    new Response('not json', { status: 200 }),
  ]) {
    globalThis.fetch = async () => response;
    assert.equal(await extendTollCapability(legacy, signal), legacy);
  }
  globalThis.fetch = async () => Response.json({ enabled: false, catalog: true });
  assert.deepEqual(await extendTollCapability(legacy, signal), {
    ...legacy,
    routingTollsEnabled: false,
    routingTollsCatalogEnabled: true,
  });
  globalThis.fetch = async () => Response.json({ enabled: false });
  assert.deepEqual(await extendTollCapability({ ...legacy, routingTollsEnabled: true }, signal), {
    ...legacy,
    routingTollsEnabled: true,
    routingTollsCatalogEnabled: false,
  });
  globalThis.fetch = async () => {
    throw new Error('offline');
  };
  assert.equal(await extendTollCapability(legacy, signal), legacy);
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(extendTollCapability(legacy, cancelled.signal), { name: 'AbortError' });
  console.log('PASS server toll capability: native, auxiliary, unavailable, malformed, abort');
} finally {
  globalThis.fetch = originalFetch;
}
