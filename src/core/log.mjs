const seen = new Set();

export function log(...args) {
  console.log('[alba]', ...args);
}

export function warn(...args) {
  console.warn('[alba]', ...args);
}

export function warnOnce(key, ...args) {
  if (seen.has(key)) return;
  seen.add(key);
  console.warn('[alba]', ...args);
}

export function error(...args) {
  console.error('[alba]', ...args);
}

export function resetOnce() {
  seen.clear();
}
