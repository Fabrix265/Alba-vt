import test from 'node:test';
import assert from 'node:assert/strict';

let caseId = 0;

function makeElement() {
  const listeners = {};
  const attrs = {};
  const classes = new Set();
  const element = {
    textContent: '',
    style: {},
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      toggle: (name, force) => {
        const on = force === undefined ? !classes.has(name) : Boolean(force);
        if (on) classes.add(name); else classes.delete(name);
        return on;
      },
      contains: (name) => classes.has(name)
    },
    addEventListener: (type, handler) => { (listeners[type] ??= []).push(handler); },
    dispatch: (type) => { for (const handler of listeners[type] ?? []) handler.call(element); },
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    removeAttribute: (name) => { delete attrs[name]; },
    setAttribute: (name, value) => { attrs[name] = String(value); },
    pause() {},
    load() {},
    play: () => ({ catch() {} }),
    closest: () => null
  };
  Object.defineProperty(element, 'src', {
    get: () => attrs.src ?? '',
    set: (value) => { attrs.src = String(value); },
    configurable: true
  });
  return element;
}

async function loadRenderer() {
  const ids = ['clip-image', 'clip-video', 'pet', 'placeholder', 'placeholder-hint', 'bubble', 'status'];
  const elements = Object.fromEntries(ids.map((id) => [id, makeElement()]));
  const handlers = { state: null, interactive: null, connection: null };
  const documentStub = {
    getElementById: (id) => elements[id],
    addEventListener: () => {},
    body: makeElement()
  };
  const windowStub = {
    alba: {
      onState: (callback) => { handlers.state = callback; },
      onConnection: (callback) => { handlers.connection = callback; },
      onInteractive: (callback) => { handlers.interactive = callback; },
      getConfig: () => Promise.resolve({ interactive: false }),
      setIgnoreMouseEvents: () => {},
      dragStart: () => {},
      dragEnd: () => {}
    },
    addEventListener: () => {}
  };
  globalThis.document = documentStub;
  globalThis.window = windowStub;
  await import(`../../desktop/renderer/renderer.mjs?case=${++caseId}`);
  await new Promise((resolve) => setImmediate(resolve));
  return {
    elements,
    sendState: (message) => handlers.state?.(message),
    setConnected: (value) => handlers.connection?.({ connected: value })
  };
}

test('sin conexion la ventana muestra el marcador en vez de quedar transparente', async () => {
  const { elements } = await loadRenderer();
  assert.equal(elements.placeholder.classList.contains('visible'), true);
  assert.match(elements['placeholder-hint'].textContent, /Conectando con el bridge/);
});

test('sin clip el marcador sigue visible y explica que faltan los clips', async () => {
  const { elements, sendState, setConnected } = await loadRenderer();
  setConnected(true);
  sendState({ type: 'state', clip: null });
  assert.equal(elements.placeholder.classList.contains('visible'), true);
  assert.match(elements['placeholder-hint'].textContent, /Agrega tus clips/);
});

test('un clip se muestra y oculta el marcador; volver a null lo recupera', async () => {
  const { elements, sendState } = await loadRenderer();
  sendState({ type: 'state', clip: { kind: 'image', file: 'assets/pngtuber/idle.gif', fit: 'contain', loop: true } });
  assert.equal(elements['clip-image'].classList.contains('visible'), true);
  assert.equal(elements.placeholder.classList.contains('visible'), false);

  sendState({ type: 'state', clip: null });
  assert.equal(elements['clip-image'].classList.contains('visible'), false);
  assert.equal(elements.placeholder.classList.contains('visible'), true);
});

test('un clip que no se puede decodificar cae al marcador y no deja la ventana vacia', async () => {
  const { elements, sendState } = await loadRenderer();
  sendState({ type: 'state', clip: { kind: 'image', file: 'assets/pngtuber/idle.gif', fit: 'contain', loop: true } });
  assert.equal(elements['clip-image'].classList.contains('visible'), true);

  elements['clip-image'].dispatch('error');
  assert.equal(elements['clip-image'].classList.contains('visible'), false);
  assert.equal(elements.placeholder.classList.contains('visible'), true);
});
