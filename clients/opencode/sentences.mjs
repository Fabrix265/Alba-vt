// Convierte el texto que opencode va escribiendo en frases legibles para el
// globo de Alba: sin bloques de codigo ni simbolos de markdown, una por una
// a medida que se completan.

export const MAX_SENTENCE = 280;
const TERMINATOR = /[.!?…:;](?=\s)|\n/g;

// Quita markdown y deja texto que se pueda "decir".
export function cleanSpeech(text) {
  return String(text ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
    .replace(/(\*\*|__|\*|_|~~)(\S[^*_~]*?\S|\S)\1/g, '$2')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function split(text) {
  return cleanSpeech(text)
    .split(/(?<=[.!?…])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 2 && /[\p{L}\p{N}]/u.test(sentence))
    .map((sentence) => (sentence.length > MAX_SENTENCE ? `${sentence.slice(0, MAX_SENTENCE - 1)}…` : sentence));
}

// Lleva la cuenta de lo ya dicho de cada parte de texto.
export function createSentenceStream() {
  let consumed = 0;

  // `text` es el texto completo hasta ahora; `final` cuando la parte termino.
  return function next(text, { final = false } = {}) {
    const full = String(text ?? '');
    if (full.length < consumed) consumed = 0;
    let pending = full.slice(consumed);
    // No cortar dentro de un bloque de codigo que todavia no se cerro.
    const fences = pending.match(/```/g)?.length ?? 0;
    if (!final && fences % 2 === 1) pending = pending.slice(0, pending.lastIndexOf('```'));
    let cut = pending.length;
    if (!final) {
      // Ultimo fin de frase que no caiga dentro de un bloque de codigo.
      const fenceAt = [...pending.matchAll(/```/g)].map((match) => match.index);
      const insideCode = (index) => fenceAt.filter((at) => at < index).length % 2 === 1;
      cut = 0;
      for (const match of pending.matchAll(TERMINATOR)) {
        if (!insideCode(match.index)) cut = match.index + match[0].length;
      }
    }
    if (cut === 0) return [];
    const chunk = pending.slice(0, cut);
    consumed += cut;
    return split(chunk);
  };
}
