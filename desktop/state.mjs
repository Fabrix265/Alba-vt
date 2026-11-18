import fs from 'node:fs';
import path from 'node:path';

export const MIN_WINDOW_SIZE = 100;
export const MAX_WINDOW_SIZE = 4000;
// v3: descarta tamanos inflados por el bug de arrastre con escala de Windows != 100 %.
const WINDOW_STATE_VERSION = 3;
export const SCALE_STEP = 1.15;

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

// Encoge la ventana para que quepa en el area y la mete dentro si se salia.
export function fitInArea(bounds, area, min = MIN_WINDOW_SIZE) {
  const width = Math.round(Math.max(min, Math.min(bounds.width, area.width)));
  const height = Math.round(Math.max(min, Math.min(bounds.height, area.height)));
  const x = Math.round(Math.min(Math.max(bounds.x ?? area.x, area.x), area.x + area.width - width));
  const y = Math.round(Math.min(Math.max(bounds.y ?? area.y, area.y), area.y + area.height - height));
  return { x, y, width, height };
}

// Escala la ventana manteniendo fijo el centro de la base (donde "apoya" Alba).
export function scaleBounds(bounds, factor, area, min = MIN_WINDOW_SIZE) {
  if (!bounds || !Number.isFinite(factor) || factor <= 0) return null;
  const ratio = bounds.width / bounds.height;
  let width = bounds.width * factor;
  let height = bounds.height * factor;
  const maxWidth = Math.min(area?.width ?? MAX_WINDOW_SIZE, MAX_WINDOW_SIZE);
  const maxHeight = Math.min(area?.height ?? MAX_WINDOW_SIZE, MAX_WINDOW_SIZE);
  // Respeta la proporcion al chocar con los limites.
  if (width > maxWidth) { width = maxWidth; height = width / ratio; }
  if (height > maxHeight) { height = maxHeight; width = height * ratio; }
  if (width < min) { width = min; height = width / ratio; }
  if (height < min) { height = min; width = height * ratio; }
  const next = {
    x: bounds.x + (bounds.width - width) / 2,
    y: bounds.y + bounds.height - height,
    width,
    height
  };
  return area ? fitInArea(next, area, min) : {
    x: Math.round(next.x), y: Math.round(next.y), width: Math.round(width), height: Math.round(height)
  };
}

export function resolveBounds({ size = null, saved = null, displays = [], fallback = { width: 420, height: 560 } } = {}) {
  const chosen = size ?? (saved ? { width: saved.width, height: saved.height } : fallback);
  const width = Math.max(MIN_WINDOW_SIZE, Math.round(chosen.width));
  const height = Math.max(MIN_WINDOW_SIZE, Math.round(chosen.height));
  const placed = saved ? { x: saved.x, y: saved.y, width, height } : null;
  const display = placed ? displays.find((entry) => intersects(placed, entry.workArea)) : null;
  if (display) return fitInArea(placed, display.workArea);
  const area = displays[0]?.workArea;
  if (area) {
    const fitted = fitInArea({ x: area.x, y: area.y, width, height }, area);
    return { width: fitted.width, height: fitted.height };
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