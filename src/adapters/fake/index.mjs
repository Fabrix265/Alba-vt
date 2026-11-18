export function createFakeAdapter() {
  const calls = [];
  let connected = false;

  const capabilities = Object.freeze({
    hotkeys: true,
    parameters: true,
    items: true,
    clips: false,
    modelDetection: true,
    processControl: false
  });

  function record(type, payload) {
    calls.push({ type, payload, at: Date.now() });
  }

  async function connect() {
    connected = true;
    record('connect', {});
  }

  async function disconnect() {
    connected = false;
    record('disconnect', {});
  }

  function applyState(state, context = {}) {
    const scene = context.scenes?.scenes?.[state.effective] ?? null;
    record('state', {
      effective: state.effective,
      props: state.props,
      asleep: state.asleep,
      deepSleep: state.deepSleep,
      scene
    });
  }

  function setMouth(value) {
    record('mouth', { value });
  }

  function speak({ text = '' } = {}) {
    record('speak', { text });
  }

  function getCalls() {
    return structuredClone(calls);
  }

  function clear() {
    calls.length = 0;
  }

  return {
    name: 'fake',
    assetTypes: Object.freeze(['item']),
    capabilities,
    connect,
    disconnect,
    applyState,
    setMouth,
    speak,
    getCalls,
    clear,
    get connected() {
      return connected;
    }
  };
}
