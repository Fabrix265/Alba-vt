// Cola de lo que Alba dice. Reparte las frases al ritmo en que el globo las
// escribe y se leen, para que ninguna se corte ni se salte, y avisa cuando
// termino de hablar (el director espera eso para volver a reposo).

export const TYPE_MS_PER_CHAR = 28;
const READ_MS_PER_CHAR = 45;
const MIN_READ_MS = 1500;
const MAX_READ_MS = 9000;
const GAP_MS = 250;

// Tiempo que tarda una frase: escribirla letra por letra y dejarla leer.
export function speechDurationMs(text) {
  const chars = [...String(text ?? '')].length;
  const read = Math.min(MAX_READ_MS, Math.max(MIN_READ_MS, chars * READ_MS_PER_CHAR));
  return chars * TYPE_MS_PER_CHAR + read;
}

export function createSpeechQueue({ onSay, onDone, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const queue = [];
  let timer = null;

  function playNext() {
    timer = null;
    const text = queue.shift();
    if (text === undefined) {
      onDone?.();
      return;
    }
    onSay?.(text);
    timer = setTimer(playNext, speechDurationMs(text) + GAP_MS);
    timer?.unref?.();
  }

  function enqueue(text) {
    const clean = String(text ?? '').trim();
    if (!clean) return;
    queue.push(clean);
    if (timer === null) playNext();
  }

  // Descarta lo pendiente (p. ej. llega un mensaje nuevo o se duerme).
  function clear() {
    queue.length = 0;
    if (timer !== null) clearTimer(timer);
    timer = null;
  }

  return {
    enqueue,
    clear,
    get busy() { return timer !== null || queue.length > 0; },
    get pending() { return queue.length; }
  };
}
