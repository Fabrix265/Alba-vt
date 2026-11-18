import { readEnvironment } from '../../src/environment.mjs';

export function createBridgeClient({ env = readEnvironment(), timeoutMs = 1500, fetchImpl = fetch } = {}) {
  const port = Number(env.ALBA_BRIDGE_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('ALBA_BRIDGE_PORT invalido');
  const base = `http://127.0.0.1:${port}`;
  async function request(route, payload) {
    if (!env.ALBA_TOKEN) throw new Error('Configura ALBA_TOKEN en .env y arranca npm start');
    let response;
    try {
      response = await fetchImpl(`${base}${route}`, {
        method: payload === undefined ? 'GET' : 'POST',
        headers: { 'X-Alba-Token': env.ALBA_TOKEN, 'Content-Type': 'application/json' },
        body: payload === undefined ? undefined : JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs), redirect: 'error'
      });
    } catch {
      throw new Error('Bridge no disponible; comprueba npm start y ALBA_BRIDGE_PORT');
    }
    let result;
    try { result = await response.json(); } catch { throw new Error('Respuesta del bridge invalida'); }
    if (!response.ok || result.ok === false) {
      // Do not echo arbitrary response bodies, which may contain credentials.
      throw Object.assign(new Error(`Bridge HTTP ${response.status}; comprueba el token y los argumentos`), {
        statusCode: response.status
      });
    }
    return result;
  }
  return {
    state: () => request('/state'),
    event: (event) => request('/event', event),
    intent: (intent) => request('/intent', intent)
  };
}
