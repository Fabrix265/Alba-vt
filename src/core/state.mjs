export function createState(initial = {}) {
  let value = { ...initial };
  const listeners = new Set();

  function get() {
    return value;
  }

  function set(patch) {
    const next = typeof patch === 'function' ? patch(value) : patch;
    if (!next) return value;
    value = { ...value, ...next };
    for (const listener of [...listeners]) listener(value);
    return value;
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { get, set, subscribe };
}
