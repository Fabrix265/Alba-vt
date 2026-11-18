// Frases propias de Alba (config/phrases.json). Elige una al azar por escena,
// sin repetir hasta agotar la lista, sin repetir las ultimas `memory` frases y
// respetando una pausa minima entre frases para que no hable en cada evento.

function shuffle(list, random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function createPhrasebook({ config = {}, random = Math.random, now = Date.now } = {}) {
  let settings = {};
  let groups = {};
  const bags = new Map();
  const recent = [];
  let lastSpokenAt = Number.NEGATIVE_INFINITY;

  function update(next = {}) {
    settings = next.settings ?? {};
    groups = next.phrases ?? {};
    bags.clear();
  }
  update(config);

  function remember(line) {
    recent.push(line);
    const memory = settings.memory ?? 40;
    while (recent.length > memory) recent.shift();
  }

  // Bolsa barajada por grupo: cada frase sale una vez antes de repetir ronda.
  function draw(key, lines) {
    let bag = bags.get(key);
    if (!bag || bag.length === 0) {
      bag = shuffle(lines, random);
      // Que la primera de la ronda nueva no sea la ultima de la anterior.
      if (bag.length > 1 && bag[0] === recent.at(-1)) bag.push(bag.shift());
      bags.set(key, bag);
    }
    const fresh = bag.findIndex((line) => !recent.includes(line));
    const [line] = bag.splice(fresh >= 0 ? fresh : 0, 1);
    return line;
  }

  // Devuelve una frase para la escena `key`, o null si toca quedarse callada.
  function pick(key, at = now(), { force = false } = {}) {
    const group = groups[key];
    if (!group?.lines?.length) return null;
    const gap = settings.minGapMs ?? 7000;
    if (!force && !group.ignoreGap && at - lastSpokenAt < gap) return null;
    const chance = group.chance ?? settings.chance ?? 0.5;
    if (!force && random() >= chance) return null;
    const line = draw(key, group.lines);
    remember(line);
    lastSpokenAt = at;
    return line;
  }

  // Cualquier cosa que diga Alba (frases o respuesta de opencode) cuenta para la pausa.
  function noteSpoken(at = now()) {
    lastSpokenAt = at;
  }

  return { pick, noteSpoken, update };
}
