import { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, nativeImage, protocol, screen } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { readEnvironment } from '../src/environment.mjs';
import { resolveAssetPath } from '../src/core/paths.mjs';
import {
  applyResize, isOnScreen, loadWindowState, parseSize, resolveBounds, saveWindowState, scaleBounds,
  MIN_WINDOW_SIZE, SCALE_STEP
} from './state.mjs';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.env.ALBA_ROOT || path.join(dirname, '..'));
const env = readEnvironment({ rootDir: root });
const windowFile = () => path.join(app.getPath('userData'), 'window.json');
const INTERACTIVE_SHORTCUT = 'Control+Alt+A';
const RESIZE_EDGES = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']);
const MIME = {
  '.png': 'image/png', '.gif': 'image/gif', '.apng': 'image/apng', '.webp': 'image/webp',
  '.webm': 'video/webm', '.mp4': 'video/mp4'
};

let window = null;
let tray = null;
let socket = null;
let reconnectTimer = null;
let lastState = null;
let interactive = false;
let dragTimer = null;
let dragOffset = null;
let dragSize = null;
// Tamano pedido por nosotros. Windows con escala != 100 % devuelve 1-2 px de
// mas al leerlo; si lo releyeramos para el siguiente movimiento, creceria.
let logicalSize = null;
let lastClipSize = null;
let resizeTimer = null;
let resizeEdge = null;
let resizeStart = null;
let resizeBounds = null;
let autoFit = false;
let userSized = false;
let saveTimer = null;

protocol.registerSchemesAsPrivileged([
  { scheme: 'alba-clip', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
]);

// Solo se sirven archivos de assets/, igual que valida el adapter.
const rootFile = (relative) => resolveAssetPath(root, relative);
const FORWARDED = new Set(['hello', 'state', 'say']);

function send(channel, value) {
  if (window && !window.isDestroyed()) window.webContents.send(channel, value);
}

function setIgnore(ignore) {
  if (ignore) stopResize(false);
  if (!window || window.isDestroyed() || interactive) return;
  window.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
}

function stopDrag() {
  if (dragTimer) clearInterval(dragTimer);
  dragTimer = null;
  dragOffset = null;
  dragSize = null;
  if (window && !window.isDestroyed()) scheduleSave();
}

function stopResize(save = true) {
  if (resizeTimer) clearInterval(resizeTimer);
  resizeTimer = null;
  resizeEdge = null;
  resizeStart = null;
  resizeBounds = null;
  if (save && window && !window.isDestroyed()) scheduleSave();
}

function startResize(edge) {
  if (!window || window.isDestroyed() || !interactive || !RESIZE_EDGES.has(edge)) return;
  stopResize(false);
  autoFit = false;
  userSized = true;
  resizeEdge = edge;
  resizeStart = screen.getCursorScreenPoint();
  resizeBounds = currentBounds();
  resizeTimer = setInterval(() => {
    if (!window || window.isDestroyed()) return stopResize(false);
    const cursor = screen.getCursorScreenPoint();
    const area = screen.getDisplayMatching(window.getBounds()).workArea;
    const next = applyResize({
      edge: resizeEdge,
      bounds: resizeBounds,
      dx: cursor.x - resizeStart.x,
      dy: cursor.y - resizeStart.y,
      min: MIN_WINDOW_SIZE,
      max: { width: area.width, height: area.height }
    });
    if (!next) return stopResize(false);
    setBoundsIfChanged({
      x: Math.min(Math.max(next.x, area.x), area.x + area.width - next.width),
      y: Math.min(Math.max(next.y, area.y), area.y + area.height - next.height),
      width: next.width,
      height: next.height
    });
  }, 16);
}

// Con escala de Windows distinta de 100 %, cada setPosition/setBounds puede
// sumar un pixel por redondeo. Por eso siempre se pasa el tamano explicito y
// no se toca la ventana si nada cambio.
function setBoundsIfChanged(next) {
  if (!window || window.isDestroyed()) return;
  const current = currentBounds();
  if (current.x === next.x && current.y === next.y && current.width === next.width && current.height === next.height) return;
  logicalSize = { width: next.width, height: next.height };
  window.setBounds(next);
}

function currentBounds() {
  const bounds = window.getBounds();
  return logicalSize ? { ...bounds, ...logicalSize } : bounds;
}

function workArea() {
  return screen.getDisplayMatching(window.getBounds()).workArea;
}

function scaleWindow(factor) {
  if (!window || window.isDestroyed()) return;
  const next = scaleBounds(currentBounds(), factor, workArea());
  if (!next) return;
  autoFit = false;
  userSized = true;
  setBoundsIfChanged(next);
  scheduleSave();
}

// Ajusta la ventana al tamano natural del clip actual (sin pasar del 90 % de la pantalla).
function fitToClip() {
  if (!window || window.isDestroyed() || !lastClipSize) return false;
  const area = workArea();
  const { width, height } = lastClipSize;
  const scale = Math.min((area.width * 0.9) / width, (area.height * 0.9) / height, 1);
  const bounds = currentBounds();
  const nextWidth = Math.max(MIN_WINDOW_SIZE, Math.round(width * scale));
  const nextHeight = Math.max(MIN_WINDOW_SIZE, Math.round(height * scale));
  const next = scaleBounds(bounds, 1, area) ?? bounds;
  setBoundsIfChanged({
    x: Math.round(Math.min(Math.max(next.x + (next.width - nextWidth) / 2, area.x), area.x + area.width - nextWidth)),
    y: Math.round(Math.min(Math.max(next.y + next.height - nextHeight, area.y), area.y + area.height - nextHeight)),
    width: nextWidth,
    height: nextHeight
  });
  scheduleSave();
  return true;
}

function setInteractive(value) {
  interactive = Boolean(value);
  if (!interactive) stopResize();
  if (window && !window.isDestroyed()) {
    window.setIgnoreMouseEvents(!interactive, { forward: true });
    send('pet:interactive', interactive);
  }
  rebuildMenu();
}

function saveBounds() {
  if (!window || window.isDestroyed()) return;
  saveWindowState(windowFile(), currentBounds());
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; saveBounds(); }, 250);
}

function rebuildMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Modo interaccion', type: 'checkbox', checked: interactive, click: () => setInteractive(!interactive) },
    { label: 'Mostrar a Alba', click: () => { window?.show(); window?.focus(); } },
    { label: 'Tamaño', submenu: [
      { label: 'Agrandar', click: () => scaleWindow(SCALE_STEP) },
      { label: 'Achicar', click: () => scaleWindow(1 / SCALE_STEP) },
      { label: 'Tamaño original del clip', enabled: Boolean(lastClipSize), click: () => fitToClip() }
    ] },
    { label: 'Reconectar', click: () => { socket?.close(); } },
    { type: 'separator' },
    { label: 'Salir', click: () => app.quit() }
  ]));
}

function createWindow() {
  const requestedSize = parseSize(env.ALBA_PET_WINDOW);
  if (requestedSize === null && String(env.ALBA_PET_WINDOW ?? '').trim()) {
    console.warn(`[alba] ALBA_PET_WINDOW="${env.ALBA_PET_WINDOW}" no es valido; usa anchoxalto (p. ej. 240x240). Se usara el ultimo tamano guardado.`);
  }
  const saved = loadWindowState(windowFile());
  const displays = screen.getAllDisplays();
  const bounds = resolveBounds({ size: requestedSize, saved, displays });
  autoFit = !requestedSize && !(saved && isOnScreen(saved, displays));
  logicalSize = { width: bounds.width, height: bounds.height };
  window = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    resizable: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    minWidth: MIN_WINDOW_SIZE,
    minHeight: MIN_WINDOW_SIZE,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  window.setAlwaysOnTop(true, 'screen-saver');
  window.setIgnoreMouseEvents(true, { forward: true });
  window.loadFile(path.join(dirname, 'renderer', 'index.html'));
  window.once('ready-to-show', () => window.showInactive());
  window.on('moved', scheduleSave);
  window.on('blur', () => { stopDrag(); stopResize(); });
  window.on('closed', () => { window = null; });
  window.webContents.on('did-finish-load', () => {
    send('pet:connection', { connected: socket?.readyState === WebSocket.OPEN });
    if (lastState) send('pet:state', lastState);
  });
}

function connect() {
  if (socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(socket.readyState)) return;
  const port = Number(env.ALBA_PET_PORT || 8791);
  const token = env.ALBA_PET_TOKEN || env.ALBA_TOKEN || '';
  const url = `ws://127.0.0.1:${port}/` + (token ? `?token=${encodeURIComponent(token)}` : '');
  socket = new WebSocket(url);
  socket.on('open', () => send('pet:connection', { connected: true }));
  socket.on('message', (raw) => {
    try {
      const message = JSON.parse(raw.toString('utf8'));
      if (!FORWARDED.has(message?.type)) return;
      if (message.type === 'state') lastState = message;
      send('pet:state', message);
    } catch {}
  });
  socket.on('close', () => {
    send('pet:connection', { connected: false });
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 1500);
  });
  socket.on('error', () => {});
}

// Una sola ventana de Alba: si ya hay una (abierta por el bridge o por
// npm run pet), la segunda se cierra y muestra la existente.
const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();
app.on('second-instance', () => { window?.showInactive(); });

app.whenReady().then(async () => {
  if (!primary) return;
  protocol.handle('alba-clip', async (request) => {
    try {
      const url = new URL(request.url);
      const relative = url.pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part)).join(path.sep);
      const absolute = rootFile(relative);
      const type = absolute ? MIME[path.extname(absolute).toLowerCase()] : null;
      if (!absolute || !type) return new Response('no encontrado', { status: 404 });
      const data = await fs.promises.readFile(absolute);
      return new Response(data, { headers: { 'content-type': type, 'cache-control': 'no-cache' } });
    } catch {
      return new Response('no encontrado', { status: 404 });
    }
  });

  createWindow();
  connect();

  const trayIcon = nativeImage.createFromPath(path.join(dirname, 'tray.png'));
  tray = new Tray(trayIcon);
  tray.setToolTip('Alba PNGTuber');
  tray.on('click', () => setInteractive(!interactive));
  rebuildMenu();

  globalShortcut.register(INTERACTIVE_SHORTCUT, () => setInteractive(!interactive));
});

ipcMain.on('pet:ignore', (_event, ignore) => setIgnore(ignore));
ipcMain.on('pet:drag-start', () => {
  if (!window || window.isDestroyed()) return;
  const point = screen.getCursorScreenPoint();
  const bounds = currentBounds();
  dragOffset = { x: point.x - bounds.x, y: point.y - bounds.y };
  dragSize = { width: bounds.width, height: bounds.height };
  if (dragTimer) clearInterval(dragTimer);
  dragTimer = setInterval(() => {
    if (!window || window.isDestroyed()) return stopDrag();
    const cursor = screen.getCursorScreenPoint();
    // Tamano fijo durante todo el arrastre: mover nunca debe agrandar la ventana.
    setBoundsIfChanged({ x: cursor.x - dragOffset.x, y: cursor.y - dragOffset.y, ...dragSize });
  }, 16);
});
ipcMain.on('pet:drag-end', stopDrag);
ipcMain.on('pet:resize-start', (_event, edge) => startResize(String(edge)));
ipcMain.on('pet:resize-end', () => stopResize());
ipcMain.on('pet:clip-size', (_event, size) => {
  const width = Number(size?.width);
  const height = Number(size?.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return;
  const first = !lastClipSize;
  lastClipSize = { width, height };
  if (first) rebuildMenu();
  if (!autoFit || userSized || !window || window.isDestroyed()) return;
  autoFit = false;
  fitToClip();
});
// Rueda del raton en modo interaccion: agrandar o achicar.
ipcMain.on('pet:scale', (_event, direction) => {
  if (!interactive) return;
  scaleWindow(Number(direction) > 0 ? SCALE_STEP : 1 / SCALE_STEP);
});
// Duracion del fundido entre clips: 0 = corte instantaneo, maximo 2000 ms.
function transitionMs() {
  const raw = String(env.ALBA_PET_TRANSITION_MS ?? '').trim();
  const value = raw === '' ? 250 : Number(raw);
  return Number.isFinite(value) ? Math.min(2000, Math.max(0, Math.round(value))) : 250;
}
const BUBBLE_STYLES = ['terminal', 'comic', 'subtitulo', 'tarjeta'];
function bubbleStyle() {
  const value = String(env.ALBA_PET_BUBBLE ?? '').trim().toLowerCase();
  if (!value) return 'terminal';
  if (BUBBLE_STYLES.includes(value)) return value;
  console.warn(`[alba] ALBA_PET_BUBBLE="${value}" no existe; usa ${BUBBLE_STYLES.join(', ')}. Uso terminal.`);
  return 'terminal';
}
ipcMain.handle('pet:config', () => ({
  interactive, port: Number(env.ALBA_PET_PORT || 8791), fadeMs: transitionMs(), bubble: bubbleStyle()
}));

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (socket) socket.close();
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (dragTimer) clearInterval(dragTimer);
  if (resizeTimer) clearInterval(resizeTimer);
});

app.on('window-all-closed', () => app.quit());