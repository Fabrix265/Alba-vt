export function buildLipSync({ text = '', audio = null, minMs = 600, maxMs = 6000, stepMs = 80, charMs = 55 } = {}) {
  const raw = Math.round(String(text).length * charMs);
  const durationMs = Math.min(maxMs, Math.max(minMs, raw || minMs));
  let seed = 2166136261;
  for (const char of String(text)) {
    seed = Math.imul(seed ^ char.codePointAt(0), 16777619) >>> 0;
  }
  let state = seed || 1;
  const random = () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
  const frames = [];
  for (let at = 0; at < durationMs; at += stepMs) {
    frames.push({ at, value: 0.15 + random() * 0.75 });
  }
  frames.push({ at: durationMs, value: 0 });
  return { durationMs, frames, synthetic: audio === null || audio === undefined };
}

export function createSpeech({ onFrame, now = () => Date.now(), stepMs = 80 } = {}) {
  let timer = null;
  let current = null;

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    current = null;
  }

  function speak({ text = '', audio = null } = {}) {
    stop();
    const result = buildLipSync({ text, audio, stepMs });
    const startedAt = now();
    let index = 0;
    current = result;
    const emitNext = () => {
      const elapsed = now() - startedAt;
      while (index < result.frames.length && result.frames[index].at <= elapsed) {
        const frame = result.frames[index];
        index += 1;
        onFrame?.(frame.value, frame);
      }
      if (elapsed >= result.durationMs) stop();
    };
    emitNext();
    if (current === result) {
      timer = setInterval(emitNext, stepMs);
      timer.unref?.();
    }
    return result;
  }

  function isSpeaking() {
    return timer !== null;
  }

  return { speak, stop, isSpeaking, buildLipSync };
}
