export function createCapabilities(definitions = {}) {
  const map = new Map(Object.entries(definitions));

  function has(name) {
    return map.get(name) === true;
  }

  function get(name) {
    return map.get(name) ?? false;
  }

  function list() {
    return [...map.entries()].filter(([, value]) => value === true).map(([name]) => name);
  }

  function all() {
    return Object.fromEntries(map);
  }

  return { has, get, list, all };
}
