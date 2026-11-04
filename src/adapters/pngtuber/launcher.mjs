import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

export function createPetLauncher({ rootDir, env = {}, warn = () => {} } = {}) {
  let child = null;
  let missingReported = false;
  const enabled = env.ALBA_PET_LAUNCH !== 'false';

  function start() {
    if (!enabled || child) return false;
    let electron;
    try {
      const entry = require.resolve('electron');
      if (!fs.existsSync(path.join(path.dirname(entry), 'path.txt'))) {
        if (!missingReported) {
          missingReported = true;
          warn('[alba] PNGTuber: el binario de Electron aun no esta descargado; ejecuta npm run pet una vez');
        }
        return false;
      }
      electron = require('electron');
    } catch {
      if (!missingReported) {
        missingReported = true;
        warn('[alba] PNGTuber: Electron no esta instalado; instala dependencias opcionales o abre la ventana con npm run pet');
      }
      return false;
    }
    if (typeof electron !== 'string') return false;
    child = spawn(electron, [path.join(rootDir, 'desktop', 'main.mjs')], {
      cwd: rootDir,
      env: { ...env, ALBA_ROOT: rootDir },
      stdio: 'ignore',
      windowsHide: false
    });
    child.on('exit', () => { child = null; });
    child.on('error', () => {
      child = null;
      if (!missingReported) {
        missingReported = true;
        warn('[alba] PNGTuber: no se pudo abrir la ventana de Electron');
      }
    });
    return true;
  }

  function stop() {
    if (!child) return;
    child.kill();
    child = null;
  }

  return { start, stop, get running() { return Boolean(child); } };
}