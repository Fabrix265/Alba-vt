import { createCapabilities } from '../../core/capabilities.mjs';
import { warnOnce } from '../../core/log.mjs';
import { createHub } from './hub.mjs';
import { createPetLauncher } from './launcher.mjs';
import { stateMessage } from './protocol.mjs';
import { selectClip } from './resolve.mjs';

const DEFAULT_PORT = 8791;

export function createPngtuberAdapter({
  rootDir, env = {}, hub, launcher, logger = { warn: warnOnce }
} = {}) {
  const port = Number(env.ALBA_PET_PORT ?? DEFAULT_PORT);
  const token = env.ALBA_PET_TOKEN || env.ALBA_TOKEN || '';
  const socketHub = hub ?? createHub({
    port, token,
    logger: { warn: (message) => logger.warn?.('pngtuber-hub', message) }
  });
  const petLauncher = launcher ?? createPetLauncher({
    rootDir, env,
    warn: (message) => logger.warn?.('pet-launch', message)
  });
  const capabilities = createCapabilities({
    hotkeys: false,
    parameters: false,
    items: false,
    clips: true,
    modelDetection: false,
    processControl: false
  });
  let connected = false;
  let desired = null;
  let talking = false;
  let current = null;
  let lastSignature = null;

  function render() {
    if (!desired) return null;
    const { state, context } = desired;
    const selection = selectClip({ state, context, rootDir, talking });
    if (!selection.clip) {
      logger.warn?.(`pngtuber-clip:${selection.requestedId}`,
        `PNGTuber: falta el clip ${selection.requestedId} en assets/pngtuber; se muestra el marcador`);
    } else if (selection.missing) {
      logger.warn?.(`pngtuber-clip:${selection.missing}`,
        `PNGTuber: falta el clip ${selection.missing}; uso ${selection.clip.id}`);
    }
    const message = stateMessage({ state, scene: selection.scene, clip: selection.clip, talking });
    const signature = JSON.stringify(message);
    if (signature === lastSignature) return current;
    current = message;
    lastSignature = signature;
    if (socketHub) socketHub.broadcast(message);
    return message;
  }

  async function connect() {
    try {
      await socketHub.start();
      connected = true;
      petLauncher.start();
      return true;
    } catch (error) {
      connected = false;
      logger.warn?.('pngtuber-listen', `PNGTuber: no se pudo escuchar en 127.0.0.1:${port} (${error.message}); el bridge sigue activo`);
      return false;
    }
  }

  async function disconnect() {
    connected = false;
    petLauncher.stop();
    await socketHub.stop();
  }

  function applyState(state, context = {}) {
    desired = { state, context };
    return render();
  }

  function setMouth(value) {
    const next = Number(value) > 0.01;
    if (next === talking) return;
    talking = next;
    render();
  }

  return {
    name: 'pngtuber',
    assetTypes: Object.freeze(['clip']),
    capabilities,
    connect,
    disconnect,
    applyState,
    setMouth,
    speak() {},
    refresh() { return render(); },
    get connected() { return connected; },
    getStatus() {
      return {
        connected,
        capabilities: capabilities.all(),
        clients: socketHub?.clients ?? 0,
        port: socketHub?.port ?? port,
        clip: current?.clip ?? null,
        desktop: petLauncher.running
      };
    }
  };
}