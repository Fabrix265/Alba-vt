import fs from 'node:fs';
import path from 'node:path';

// Todo el arte (props, clips, modelos) vive dentro de assets/, ignorado por git.
export const ASSETS_DIR = 'assets';

export function assetsRoot(rootDir) {
  return path.resolve(rootDir, ASSETS_DIR);
}

// true si `file` queda dentro de `dir` (o es el propio dir), sin escaparse con '..'.
export function isInside(dir, file) {
  const relative = path.relative(path.resolve(dir), path.resolve(file));
  if (relative === '') return true;
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

// Resuelve la ruta de un recurso declarado y comprueba que este dentro de assets/.
export function resolveAssetPath(rootDir, file) {
  if (!rootDir || typeof file !== 'string' || !file) return null;
  const absolute = path.resolve(rootDir, file);
  const root = assetsRoot(rootDir);
  return absolute !== root && isInside(root, absolute) ? absolute : null;
}

function toProjectPath(rootDir, absolute) {
  return path.relative(path.resolve(rootDir), absolute).split(path.sep).join('/');
}

// Busca el archivo declarado. Si no existe y se indican extensiones, acepta el
// mismo nombre con otra extension admitida (p. ej. idle.gif en vez de idle.apng),
// asi basta con nombrar el archivo como la escena.
export function findAssetFile(rootDir, file, extensions = []) {
  const absolute = resolveAssetPath(rootDir, file);
  if (!absolute) return { path: null, file: null, alternate: false, reason: 'outside-assets' };
  if (fs.existsSync(absolute)) return { path: absolute, file, alternate: false, reason: null };
  const allowed = extensions.map((extension) => extension.toLowerCase());
  if (allowed.length) {
    const base = path.basename(absolute, path.extname(absolute)).toLowerCase();
    let entries = [];
    try { entries = fs.readdirSync(path.dirname(absolute)); } catch { /* carpeta ausente */ }
    const rank = (name) => allowed.indexOf(path.extname(name).toLowerCase());
    const match = entries
      .filter((name) => path.basename(name, path.extname(name)).toLowerCase() === base && rank(name) >= 0)
      .sort((a, b) => rank(a) - rank(b))[0];
    if (match) {
      const found = path.join(path.dirname(absolute), match);
      return { path: found, file: toProjectPath(rootDir, found), alternate: true, reason: null };
    }
  }
  return { path: null, file: null, alternate: false, reason: 'missing' };
}
