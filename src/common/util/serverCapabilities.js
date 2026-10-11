export const extendTollCapability = async (server, signal) => {
  signal.throwIfAborted();
  if (server.routingTollsCatalogEnabled === true) return server;
  try {
    const response = await fetch('/api/routing/tolls/status', {
      signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]),
    });
    if (response.ok) {
      const status = await response.json();
      return {
        ...server,
        routingTollsEnabled: server.routingTollsEnabled === true || status.enabled === true,
        routingTollsCatalogEnabled: status.catalog === true,
      };
    }
  } catch {
    signal.throwIfAborted();
  }
  return server;
};
