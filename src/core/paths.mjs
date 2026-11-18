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
