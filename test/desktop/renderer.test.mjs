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
    dataset: {},
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
  const ids = ['clip-image', 'clip-video', 'clip-image-b', 'clip-video-b', 'pet', 'placeholder', 'placeholder-hint', 'bubble', 'bubble-text', 'status'];
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

test('un clip se muestra al cargar y oculta el marcador; volver a null lo recupera', async () => {
  const { elements, sendState } = await loadRenderer();
  sendState({ type: 'state', clip: { kind: 'image', file: 'assets/pngtuber/idle.gif', fit: 'contain', loop: true } });
  assert.equal(elements['clip-image'].classList.contains('visible'), false, 'espera al primer cuadro');
  elements['clip-image'].dispatch('load');
  assert.equal(elements['clip-image'].classList.contains('visible'), true);
  assert.equal(elements.placeholder.classList.contains('visible'), false);

  sendState({ type: 'state', clip: null });
  assert.equal(elements['clip-image'].classList.contains('visible'), false);
  assert.equal(elements.placeholder.classList.contains('visible'), true);
});

test('un clip que no se puede decodificar cae al marcador y no deja la ventana vacia', async () => {
  const { elements, sendState } = await loadRenderer();
  sendState({ type: 'state', clip: { kind: 'image', file: 'assets/pngtuber/idle.gif', fit: 'contain', loop: true } });
  elements['clip-image'].dispatch('load');
  assert.equal(elements['clip-image'].classList.contains('visible'), true);
  sendState({ type: 'state', clip: { kind: 'image', file: 'assets/pngtuber/roto.gif', fit: 'contain', loop: true } });

  elements['clip-image-b'].dispatch('error');
  assert.equal(elements['clip-image'].classList.contains('visible'), false);
  assert.equal(elements.placeholder.classList.contains('visible'), true);
});

test('el globo muestra el texto de say y fit stretch se traduce a fill', async () => {
  const { elements, sendState } = await loadRenderer();
  sendState({ type: 'say', text: 'hola' });
  assert.equal(elements.bubble.classList.contains('visible'), true);
  assert.equal(elements['bubble-text'].textContent, 'h', 'escribe letra por letra');
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(elements['bubble-text'].textContent, 'hola');
  sendState({ type: 'state', clip: { kind: 'image', file: 'assets/pngtuber/idle.png', fit: 'stretch' } });
  assert.equal(elements['clip-image'].style.objectFit, 'fill');
});

test('al cambiar de clip el nuevo se funde sobre el anterior en la otra capa', async () => {
  const { elements, sendState } = await loadRenderer();
  sendState({ type: 'state', clip: { kind: 'image', file: 'assets/pngtuber/idle.gif' } });
  elements['clip-image'].dispatch('load');
  sendState({ type: 'state', clip: { kind: 'image', file: 'assets/pngtuber/coding.gif' } });
  // Mientras carga, sigue viendose el anterior: nunca queda vacia.
  assert.equal(elements['clip-image'].classList.contains('visible'), true);
  assert.equal(elements['clip-image-b'].classList.contains('visible'), false);
  assert.match(elements['clip-image-b'].src, /coding\.gif$/);
  elements['clip-image-b'].dispatch('load');
  assert.equal(elements['clip-image-b'].classList.contains('visible'), true);
  assert.equal(elements['clip-image'].classList.contains('visible'), false);
  // Un cambio rapido descarta la carga vieja: solo se muestra el ultimo pedido.
  sendState({ type: 'state', clip: { kind: 'image', file: 'assets/pngtuber/sad.gif' } });
  sendState({ type: 'state', clip: { kind: 'image', file: 'assets/pngtuber/angry.gif' } });
  assert.match(elements['clip-image'].src, /angry\.gif$/);
  elements['clip-image'].dispatch('load');
  assert.equal(elements['clip-image'].classList.contains('visible'), true);
  assert.equal(elements['clip-image-b'].classList.contains('visible'), false);
});
