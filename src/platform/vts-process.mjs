import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const runFile = promisify(execFile);
function command(value) {
  if (!value) return null;
  let parts;
  try { parts = JSON.parse(value); } catch { throw new Error('Comandos VTS: usa un array JSON de ejecutable y argumentos'); }
  if (!Array.isArray(parts) || !parts.length || parts.some((v) => typeof v !== 'string' || !v || v.includes('\0'))) {
    throw new Error('Comando VTS invalido');
  }
  return parts;
}

// No OS defaults: opt in and configure both operations locally. Never invoke a shell.
export function createVtsProcess({ env, run = runFile } = {}) {
  const enabled = env?.VTS_PROCESS_CONTROL === 'true';
  const close = enabled ? command(env.VTS_CLOSE_COMMAND) : null;
  const launch = enabled ? command(env.VTS_LAUNCH_COMMAND) : null;
  async function execute(parts, { confirmed } = {}) {
    if (confirmed !== true) throw Object.assign(new Error('Confirmacion requerida'), { statusCode: 409 });
    if (!parts) throw new Error('Operacion de proceso desactivada');
    try {
      await run(parts[0], parts.slice(1), { windowsHide: true, shell: false, timeout: 10000, maxBuffer: 65536 });
    } catch { throw new Error('El comando de VTS fallo; comprueba la configuracion local'); }
  }
  return {
    status: Object.freeze({ canClose: Boolean(close), canLaunch: Boolean(launch) }),
    close: (options) => execute(close, options), launch: (options) => execute(launch, options)
  };
}
