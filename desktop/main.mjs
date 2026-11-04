import { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, nativeImage, protocol, screen } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { readEnvironment } from '../src/environment.mjs';
import { isOnScreen, loadWindowState, saveWindowState } from './state.mjs';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.env.ALBA_ROOT || path.join(dirname, '..'));
const env = readEnvironment({ rootDir: root });
const windowFile = () => path.join(app.getPath('userData'), 'window.json');
const INTERACTIVE_SHORTCUT = 'Control+Alt+A';
const MIME = {
  '.png': 'image/png', '.gif': 'image/gif', '.apng': 'image/apng', '.webp': 'image/webp',
  '.webm': 'video/webm', '.mp4': 'video/mp4'
};

let window = null;
let tray = null;
let socket = null;
let reconnectTimer = null;
let interactive = false;
let dragTimer = null;
let dragOffset = null;
let saveTimer = null;

protocol.registerSchemesAsPrivileged([
  { scheme: 'alba-clip', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
]);

function rootFile(relative) {
  const absolute = path.resolve(root, relative);
  const assets = path.resolve(root, 'assets');
  const inside = path.relative(assets, absolute);
  if (inside.startsWith('..') || path.isAbsolute(inside)) return null;
  return absolute;
}

function send(channel, value) {
  if (window && !window.isDestroyed()) window.webContents.send(channel, value);
}

function setIgnore(ignore) {
  if (!window || window.isDestroyed() || interactive) return;
  window.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
}

function stopDrag() {
  if (dragTimer) clearInterval(dragTimer);
  dragTimer = null;
  dragOffset = null;
  if (window && !window.isDestroyed()) scheduleSave();
}

function setInteractive(value) {
  interactive = Boolean(value);
  if (window && !window.isDestroyed()) {
    window.setIgnoreMouseEvents(!interactive, { forward: true });
    send('pet:interactive', interactive);
  }
  rebuildMenu();
}

function saveBounds() {
  if (!window || window.isDestroyed()) return;
  saveWindowState(windowFile(), window.getBounds());
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
    { label: 'Reconectar', click: () => { socket?.close(); } },
    { type: 'separator' },
    { label: 'Salir', click: () => app.quit() }
  ]));
}

function createWindow() {
  const saved = loadWindowState(windowFile());
  const fallback = { x: undefined, y: undefined, width: 420, height: 560 };
  const bounds = saved && isOnScreen(saved, screen.getAllDisplays()) ? saved : fallback;
  window = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
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
  window.on('blur', stopDrag);
  window.on('closed', () => { window = null; });
  window.webContents.on('did-finish-load', () => {
    send('pet:connection', { connected: socket?.readyState === WebSocket.OPEN });
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
      if (message?.type === 'hello' || message?.type === 'state') send('pet:state', message);
    } catch {}
  });
  socket.on('close', () => {
    send('pet:connection', { connected: false });
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 1500);
  });
  socket.on('error', () => {});
}

app.whenReady().then(async () => {
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
  const [x, y] = window.getPosition();
  dragOffset = { x: point.x - x, y: point.y - y };
  if (dragTimer) clearInterval(dragTimer);
  dragTimer = setInterval(() => {
    if (!window || window.isDestroyed()) return stopDrag();
    const cursor = screen.getCursorScreenPoint();
    window.setPosition(cursor.x - dragOffset.x, cursor.y - dragOffset.y);
  }, 16);
});
ipcMain.on('pet:drag-end', stopDrag);
ipcMain.handle('pet:config', () => ({ interactive, port: Number(env.ALBA_PET_PORT || 8791) }));

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (socket) socket.close();
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (dragTimer) clearInterval(dragTimer);
});

app.on('window-all-closed', () => app.quit());