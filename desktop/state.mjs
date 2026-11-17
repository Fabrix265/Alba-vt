import fs from 'node:fs';
import path from 'node:path';

export const MIN_WINDOW_SIZE = 100;
export const MAX_WINDOW_SIZE = 4000;
const WINDOW_STATE_VERSION = 2;

export function parseSize(value) {
  if (typeof value !== 'string') return null;
  const match = /^\s*(\d{2,5})\s*[x×]\s*(\d{2,5})\s*$/i.exec(value);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width < MIN_WINDOW_SIZE || height < MIN_WINDOW_SIZE) return null;
  if (width > MAX_WINDOW_SIZE || height > MAX_WINDOW_SIZE) return null;
  return { width, height };
}

export function loadWindowState(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!value || value.version !== WINDOW_STATE_VERSION) return null;
    if (!['x', 'y', 'width', 'height'].every((key) => Number.isFinite(value[key]))) return null;
    return { x: Math.round(value.x), y: Math.round(value.y), width: Math.round(value.width), height: Math.round(value.height) };
  } catch {
    return null;
  }
}

export function saveWindowState(file, bounds) {
  if (!bounds || !['x', 'y', 'width', 'height'].every((key) => Number.isFinite(bounds[key]))) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ ...bounds, version: WINDOW_STATE_VERSION }), 'utf8');
  fs.renameSync(temporary, file);
  return true;
}

export function intersects(bounds, area) {
  return bounds.x < area.x + area.width
    && bounds.x + bounds.width > area.x
    && bounds.y < area.y + area.height
    && bounds.y + bounds.height > area.y;
}

export function isOnScreen(bounds, displays) {
  return displays.some((display) => intersects(bounds, display.workArea));
}

export function resolveBounds({ size = null, saved = null, displays = [], fallback = { width: 420, height: 560 } } = {}) {
  const chosen = size ?? (saved ? { width: saved.width, height: saved.height } : fallback);
  const width = Math.max(MIN_WINDOW_SIZE, Math.round(chosen.width));
  const height = Math.max(MIN_WINDOW_SIZE, Math.round(chosen.height));
  if (saved && isOnScreen({ x: saved.x, y: saved.y, width, height }, displays)) {
    return { x: saved.x, y: saved.y, width, height };
  }
  return { width, height };
}

export function applyResize({ edge, bounds, dx = 0, dy = 0, min = MIN_WINDOW_SIZE, max = null } = {}) {
  if (!bounds || typeof edge !== 'string') return null;
  const capWidth = Math.max(min, Math.min(max?.width ?? MAX_WINDOW_SIZE, MAX_WINDOW_SIZE));
  const capHeight = Math.max(min, Math.min(max?.height ?? MAX_WINDOW_SIZE, MAX_WINDOW_SIZE));
  let width = bounds.width;
  let height = bounds.height;
  if (edge.includes('e')) width += dx;
  if (edge.includes('w')) width -= dx;
  if (edge.includes('s')) height += dy;
  if (edge.includes('n')) height -= dy;
  width = Math.round(Math.min(capWidth, Math.max(min, width)));
  height = Math.round(Math.min(capHeight, Math.max(min, height)));
  return {
    x: edge.includes('w') ? bounds.x + (bounds.width - width) : bounds.x,
    y: edge.includes('n') ? bounds.y + (bounds.height - height) : bounds.y,
    width,
    height
  };
}