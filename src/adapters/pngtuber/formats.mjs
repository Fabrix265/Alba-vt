import path from 'node:path';

const IMAGE_EXTENSIONS = new Set(['.png', '.gif', '.apng', '.webp']);
const VIDEO_EXTENSIONS = new Set(['.webm', '.mp4']);

export function clipKind(file) {
  const extension = path.extname(file).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  return null;
}

export function supportedClipExtensions() {
  return [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS];
}