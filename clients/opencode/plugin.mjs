import { createBridgeClient } from '../http/client.mjs';
import { translate } from './translate.mjs';

export const AlbaPlugin = async ({ client, albaClient } = {}) => {
  const warned = new Set();
  function warnOnce(cause, message) {
    if (warned.has(cause)) return;
    warned.add(cause);
    try {
      Promise.resolve(client?.app?.log({ body: { service: 'alba', level: 'warn', message } })).catch(() => {});
    } catch { /* Logging must not interrupt the agent either. */ }
  }
  let bridge;
  try { bridge = albaClient ?? createBridgeClient(); } catch {
    warnOnce('config', 'Alba: revisa .env; plugin desactivado hasta reiniciar opencode');
    return {};
  }
  const queue = [];
  let draining = false;
  async function drain() {
    if (draining) return;
    draining = true;
    try {
      while (queue.length) {
        const event = queue.shift();
        try { await bridge.event(event); } catch {
          warnOnce('bridge', 'Alba: bridge no disponible; el agente sigue funcionando');
        }
      }
    } finally { draining = false; }
  }
  function forward(hook, input, output) {
    const event = translate(hook, input, output);
    if (!event) return;
    if (queue.length >= 32) {
      warnOnce('overflow', 'Alba: se omiten eventos por saturacion del bridge');
      return;
    }
    queue.push(event);
    void drain();
  }
  return {
    'tool.execute.before': async (input, output) => forward('tool.execute.before', input, output),
    'tool.execute.after': async (input, output) => forward('tool.execute.after', input, output),
    event: async (input) => forward('event', input)
  };
};
