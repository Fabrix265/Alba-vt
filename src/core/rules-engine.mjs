function asArray(value) {
  return Array.isArray(value) ? value : [value];
}

function matchesWhen(when, event, state) {
  if (!when) return true;
  if (when.type !== undefined && !asArray(when.type).includes(event.type)) return false;
  if (when.tool !== undefined && !asArray(when.tool).includes(event.tool)) return false;
  if (when.source !== undefined && !asArray(when.source).includes(event.source)) return false;
  if (when.ok !== undefined && when.ok !== event.ok) return false;
  for (const [field, expected] of Object.entries(when.state ?? {})) {
    if (!asArray(expected).includes(state[field])) return false;
  }
  if (when.textIncludes !== undefined) {
    const haystack = (event.text ?? '').toLowerCase();
    if (!haystack.includes(String(when.textIncludes).toLowerCase())) return false;
  }
  return true;
}

export function createRulesEngine({ rules = [], now = () => Date.now() } = {}) {
  const list = (Array.isArray(rules) ? rules : rules.rules ?? []).map((rule, index) => ({
    ...rule,
    _order: index,
    _lastFired: Number.NEGATIVE_INFINITY,
    _lastEventAt: Number.NEGATIVE_INFINITY,
    _window: []
  }));

  list.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a._order - b._order);

  function evaluate(event, at = now(), state = {}) {
    let fired = null;
    for (const rule of list) {
      if (!matchesWhen(rule.when, event, state)) continue;

      const debounceMs = rule.debounceMs ?? 0;
      if (at - rule._lastEventAt < debounceMs) continue;
      rule._lastEventAt = at;

      if (rule.window) {
        const windowMs = rule.window.ms;
        rule._window = rule._window.filter((timestamp) => at - timestamp < windowMs);
        rule._window.push(at);
        if (rule._window.length < rule.window.count) continue;
      }

      const cooldownMs = rule.cooldownMs ?? 0;
      if (at - rule._lastFired < cooldownMs) continue;
      if (fired) continue;

      rule._lastFired = at;
      if (rule.window) rule._window = [];
      fired = { intent: rule.intent, rule: rule.id, args: rule.args ?? null };
    }
    return fired;
  }

  function reset() {
    for (const rule of list) {
      rule._lastFired = Number.NEGATIVE_INFINITY;
      rule._lastEventAt = Number.NEGATIVE_INFINITY;
      rule._window = [];
    }
  }

  return { evaluate, reset, rules: list };
}
