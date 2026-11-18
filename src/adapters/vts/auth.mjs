import fs from 'node:fs/promises';
import { parse } from 'dotenv';
import { VtsError } from './client.mjs';
import { log } from '../../core/log.mjs';

export async function readAuthToken(envPath) {
  try {
    return parse(await fs.readFile(envPath, 'utf8')).VTS_AUTH_TOKEN ?? '';
  } catch (err) {
    if (err.code === 'ENOENT') return '';
    throw new VtsError('no se pudo leer .env para autenticar VTS', 'ENV_READ');
  }
}

export async function saveAuthToken(envPath, token) {
  // VTS tokens are printable ASCII. Quote safely for dotenv, never log them.
  if (typeof token !== 'string' || !/^[\x21-\x7e]{1,64}$/.test(token) || /['\\]/.test(token)) {
    throw new VtsError('VTS devolvio un token con formato invalido', 'AUTH_TOKEN');
  }
  let content = '';
  try { content = await fs.readFile(envPath, 'utf8'); } catch (err) {
    if (err.code !== 'ENOENT') throw new VtsError('no se pudo leer .env', 'ENV_READ');
  }
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const line = `VTS_AUTH_TOKEN='${token}'`;
  const pattern = /^[ \t]*(?:export[ \t]+)?VTS_AUTH_TOKEN[ \t]*=[^\r\n]*/gm;
  let found = false;
  content = content.replace(pattern, () => {
    const replacement = found ? '# VTS_AUTH_TOKEN duplicado eliminado' : line;
    found = true;
    return replacement;
  });
  if (!found) content += (content && !content.endsWith('\n') ? eol : '') + line + eol;
  try {
    await fs.writeFile(envPath, content, { encoding: 'utf8', mode: 0o600 });
  } catch {
    throw new VtsError('no se pudo guardar el token VTS en .env', 'ENV_WRITE');
  }
}

export function createVtsAuth({
  envPath, token, pluginName = 'Alba', pluginDeveloper = 'Alba-vt',
  timeoutMs = 60000, logger = { log }
} = {}) {
  const identity = { pluginName, pluginDeveloper };
  let currentToken = token;
  let asked = false;
  let needsSave = false;

  async function authenticate(client) {
    currentToken ??= await readAuthToken(envPath);
    if (currentToken) {
      const response = await client.request('AuthenticationRequest', {
        ...identity, authenticationToken: currentToken
      });
      if (response.authenticated) {
        if (needsSave) {
          await saveAuthToken(envPath, currentToken);
          needsSave = false;
        }
        return;
      }
      currentToken = '';
    }
    if (asked) {
      throw new VtsError('autoriza Alba en VTS y reinicia el bridge para reintentar', 'AUTH_DENIED');
    }
    // At most one authorization popup per run, even across reconnects.
    asked = true;
    logger.log('VTS: acepta el popup de autorizacion de Alba para guardar el token en .env');
    const response = await client.request('AuthenticationTokenRequest', identity, { timeoutMs });
    if (typeof response.authenticationToken !== 'string' || !response.authenticationToken) {
      throw new VtsError('VTS no concedio un token', 'AUTH_DENIED');
    }
    currentToken = response.authenticationToken;
    const auth = await client.request('AuthenticationRequest', {
      ...identity, authenticationToken: currentToken
    });
    if (!auth.authenticated) throw new VtsError('VTS no autorizo el plugin Alba', 'AUTH_DENIED');
    needsSave = true;
    await saveAuthToken(envPath, currentToken);
    needsSave = false;
    logger.log('VTS: token guardado en .env');
  }

  return { authenticate };
}