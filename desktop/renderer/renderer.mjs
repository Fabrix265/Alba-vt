// Dos capas (A y B) para fundir un clip con el siguiente en vez de cortar.
const layers = [
  { image: document.getElementById('clip-image'), video: document.getElementById('clip-video') },
  { image: document.getElementById('clip-image-b'), video: document.getElementById('clip-video-b') }
].filter((layer) => layer.image && layer.video);
const pet = document.getElementById('pet');
const placeholder = document.getElementById('placeholder');
const placeholderHint = document.getElementById('placeholder-hint');
const bubble = document.getElementById('bubble');
const bubbleText = document.getElementById('bubble-text') ?? bubble;
const BUBBLE_STYLES = new Set(['terminal', 'comic', 'subtitulo', 'tarjeta']);
const TYPE_MS = 28;
const statusDot = document.getElementById('status');
const RESIZE_EDGES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
// assets.json usa contain/cover/stretch; CSS llama "fill" a stretch.
const OBJECT_FIT = { contain: 'contain', cover: 'cover', stretch: 'fill' };
let interactive = false;
let connected = false;
let currentClip = null;
let front = 0;
let request = 0;
let fadeMs = 250;
let cleanupTimer = null;
let bubbleTimer = null;
let typeTimer = null;
let bubbleState = 'idle';
const bubbleQueue = [];
let ignoring = null;

// Evita mandar el mismo valor por IPC en cada movimiento del raton.
function setIgnore(value) {
  if (value === ignoring) return;
  ignoring = value;
  window.alba.setIgnoreMouseEvents(value);
}

function objectFit(fit) {
  return OBJECT_FIT[fit] ?? 'contain';
}

function clipUrl(file) {
  return `alba-clip://local/${file.split(/[\\/]/).map(encodeURIComponent).join('/')}`;
}

function mediaOf(layer, kind) {
  return kind === 'video' ? layer.video : layer.image;
}

function resetMedia(element) {
  element.classList.remove('visible');
  element.pause?.();
  if (element.getAttribute('src') !== null) {
    element.removeAttribute('src');
    element.load?.();
  }
}

function resetLayer(layer) {
  resetMedia(layer.image);
  resetMedia(layer.video);
}

function visibleMedia() {
  for (const layer of layers) {
    for (const element of [layer.image, layer.video]) {
      if (element.classList.contains('visible')) return element;
    }
  }
  return null;
}

function updatePlaceholder() {
  const show = currentClip === null;
  placeholder.classList.toggle('visible', show);
  if (show) placeholderHint.textContent = connected
    ? 'Agrega tus clips en assets/pngtuber'
    : 'Conectando con el bridge… (npm start)';
}

function clearClip() {
  currentClip = null;
  request += 1;
  for (const layer of layers) resetLayer(layer);
  updatePlaceholder();
}

// Cuando el clip nuevo ya tiene su primer cuadro, se funde sobre el anterior.
function reveal(token, layerIndex, element) {
  if (token !== request) return;
  const previous = layers[front];
  front = layerIndex;
  element.classList.add('visible');
  for (const other of [previous.image, previous.video]) {
    if (other !== element) other.classList.remove('visible');
  }
  updatePlaceholder();
  if (cleanupTimer) clearTimeout(cleanupTimer);
  if (previous !== layers[layerIndex]) {
    cleanupTimer = setTimeout(() => {
      cleanupTimer = null;
      if (layers[front] !== previous) resetLayer(previous);
    }, fadeMs + 50);
  }
}

function renderClip(clip) {
  if (!clip) {
    if (currentClip === null) { updatePlaceholder(); return; }
    clearClip();
    return;
  }
  const key = `${clip.kind}:${clip.file}`;
  if (currentClip === key) return;
  currentClip = key;
  const token = ++request;
  // Sin clip visible todavia, se carga en la capa de delante; si no, en la otra.
  const target = visibleMedia() ? 1 - front : front;
  const layer = layers[target];
  resetLayer(layer);
  const element = mediaOf(layer, clip.kind);
  element.style.objectFit = objectFit(clip.fit);
  element.dataset.token = String(token);
  element.dataset.layer = String(target);
  if (clip.kind === 'video') {
    element.loop = clip.loop !== false;
    element.src = clipUrl(clip.file);
    element.play().catch(() => {});
  } else {
    element.src = clipUrl(clip.file);
  }
}

function onClipReady() {
  const token = Number(this.dataset?.token);
  if (token !== request) return;
  if (this.tagName === 'VIDEO') reportNaturalSize(this.videoWidth, this.videoHeight);
  else reportNaturalSize(this.naturalWidth, this.naturalHeight);
  reveal(token, Number(this.dataset.layer), this);
}

function onClipError() {
  if (Number(this.dataset?.token) !== request || !this.getAttribute('src')) return;
  clearClip();
}

function reportNaturalSize(width, height) {
  if (!width || !height) return;
  window.alba.clipSize?.({ width, height });
}

for (const layer of layers) {
  layer.image.addEventListener('load', onClipReady);
  layer.image.addEventListener('error', onClipError);
  layer.video.addEventListener('loadeddata', onClipReady);
  layer.video.addEventListener('error', onClipError);
}

updatePlaceholder();

// Globo de dialogo: frases escritas letra por letra. El bridge ya las manda
// al ritmo de lectura (speech-queue), asi que aqui no se descarta ninguna.
function hideBubble() {
  bubbleState = 'idle';
  bubble.classList.remove('visible');
}

function nextBubble() {
  if (bubbleTimer) clearTimeout(bubbleTimer);
  bubbleTimer = null;
  const text = bubbleQueue.shift();
  if (text === undefined) { hideBubble(); return; }
  bubbleState = 'typing';
  bubbleText.textContent = '';
  bubble.classList.add('visible');
  const chars = [...text];
  let index = 0;
  const step = () => {
    // Con frases en espera escribe mas rapido.
    index = Math.min(chars.length, index + (bubbleQueue.length ? 2 : 1));
    bubbleText.textContent = chars.slice(0, index).join('');
    if (index < chars.length) { typeTimer = setTimeout(step, TYPE_MS); return; }
    typeTimer = null;
    bubbleState = 'holding';
    // Se queda un poco mas que el tiempo de lectura del bridge para no
    // parpadear entre una frase y la siguiente.
    const hold = bubbleQueue.length ? 300 : Math.min(9000, Math.max(1500, chars.length * 45)) + 900;
    bubbleTimer = setTimeout(nextBubble, hold);
  };
  step();
}

function showBubble(text) {
  if (!text) return;
  bubbleQueue.push(String(text));
  while (bubbleQueue.length > 8) bubbleQueue.shift();
  if (bubbleState === 'idle' || bubbleState === 'holding') nextBubble();
}

function setBubbleStyle(style) {
  const chosen = BUBBLE_STYLES.has(style) ? style : 'terminal';
  for (const name of BUBBLE_STYLES) document.body.classList.toggle(`bubble-${name}`, name === chosen);
}

window.alba.onState((message) => {
  if (message.type === 'hello') return;
  if (message.type === 'state') {
    pet.classList.toggle('asleep', Boolean(message.asleep));
    renderClip(message.clip);
  }
  if (message.type === 'say') showBubble(message.text);
});
window.alba.onConnection(({ connected: value }) => {
  connected = Boolean(value);
  statusDot.classList.toggle('connected', connected);
  updatePlaceholder();
});
window.alba.onInteractive((value) => {
  interactive = Boolean(value);
  document.body.classList.toggle('interactive', interactive);
  if (!interactive) {
    window.alba.resizeEnd?.();
    ignoring = null;
    setIgnore(true);
  }
});
window.alba.getConfig().then(({ interactive: value, fadeMs: fade, bubble: bubbleStyle }) => {
  setBubbleStyle(bubbleStyle);
  interactive = Boolean(value);
  document.body.classList.toggle('interactive', interactive);
  if (Number.isFinite(fade) && fade >= 0) {
    fadeMs = fade;
    document.documentElement?.style?.setProperty('--fade', `${fade}ms`);
  }
});

// Rectangulo donde realmente se dibuja el clip dentro de su elemento, segun object-fit.
function drawnRect(element, width, height) {
  const box = element.getBoundingClientRect();
  if (!width || !height || !box.width || !box.height) return box;
  const fit = element.style.objectFit || 'contain';
  if (fit === 'fill') return box;
  const scale = fit === 'cover'
    ? Math.max(box.width / width, box.height / height)
    : Math.min(box.width / width, box.height / height);
  const drawnWidth = Math.min(box.width, width * scale);
  const drawnHeight = Math.min(box.height, height * scale);
  return {
    left: box.left + (box.width - drawnWidth) / 2,
    top: box.top + (box.height - drawnHeight) / 2,
    right: box.left + (box.width + drawnWidth) / 2,
    bottom: box.top + (box.height + drawnHeight) / 2
  };
}

// Fuera del modo interaccion, la ventana solo captura el raton sobre el clip
// (o el marcador); el resto deja pasar los clics al escritorio.
function isOverAlba(event) {
  if (placeholder.classList.contains('visible')) return Boolean(event.target?.closest?.('#placeholder'));
  const media = visibleMedia();
  if (!media) return false;
  const rect = media.tagName === 'VIDEO'
    ? drawnRect(media, media.videoWidth, media.videoHeight)
    : drawnRect(media, media.naturalWidth, media.naturalHeight);
  return event.clientX >= rect.left && event.clientX <= rect.right
    && event.clientY >= rect.top && event.clientY <= rect.bottom;
}

document.addEventListener('mousemove', (event) => {
  if (interactive) return;
  setIgnore(!isOverAlba(event));
});
document.addEventListener('mouseleave', () => {
  if (!interactive) setIgnore(true);
});
pet.addEventListener('mousedown', (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  window.alba.dragStart();
});
for (const edge of RESIZE_EDGES) {
  const handle = document.getElementById(`resize-${edge}`);
  if (!handle) continue;
  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    handle.setPointerCapture?.(event.pointerId);
    window.alba.resizeStart(edge);
  });
}
// En modo interaccion, la rueda del raton agranda o achica a Alba.
let lastWheel = 0;
document.addEventListener('wheel', (event) => {
  if (!interactive) return;
  event.preventDefault();
  const now = Date.now();
  if (now - lastWheel < 80) return;
  lastWheel = now;
  window.alba.scale?.(event.deltaY < 0 ? 1 : -1);
}, { passive: false });

window.addEventListener('mouseup', () => {
  window.alba.dragEnd();
  window.alba.resizeEnd?.();
});