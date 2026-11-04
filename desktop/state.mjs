import fs from 'node:fs';
import path from 'node:path';

export function loadWindowState(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!value || !['x', 'y', 'width', 'height'].every((key) => Number.isFinite(value[key]))) return null;
    return { x: Math.round(value.x), y: Math.round(value.y), width: Math.round(value.width), height: Math.round(value.height) };
  } catch {
    return null;
  }
}

export function saveWindowState(file, bounds) {
  if (!bounds || !['x', 'y', 'width', 'height'].every((key) => Number.isFinite(bounds[key]))) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(bounds), 'utf8');
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