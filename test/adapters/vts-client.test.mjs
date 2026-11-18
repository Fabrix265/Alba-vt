import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'dotenv';
import { createVtsClient } from '../../src/adapters/vts/client.mjs';
import { createVtsAuth, readAuthToken, saveAuthToken } from '../../src/adapters/vts/auth.mjs';
import { createMockVts } from '../fixtures/vts-server.mjs';

test('VTS correlaciona respuestas fuera de orden, ignora ruido y traduce errores sin secretos', async (t) => {
  const mock = await createMockVts((request, respond, socket) => {
    if (request.messageType === 'SlowRequest') {
      setTimeout(() => respond({ order: 1 }), 30);
      return;
    }
    if (request.messageType === 'ErrorRequest') {
      respond({ errorID: 50, message: 'secret-token' }, 'APIError');
      return;
    }
    socket.send('invalid json');
    socket.send(JSON.stringify({ requestID: request.requestID, messageType: 'WrongResponse' }));
    return { order: 2 };
  });
  const client = createVtsClient({ port: mock.port });
  t.after(async () => { await client.disconnect(); await mock.close(); });
  await Promise.all([client.connect(), client.connect()]);
  const slow = client.request('SlowRequest');
  assert.deepEqual(await client.request('FastRequest'), { order: 2 });
  assert.deepEqual(await slow, { order: 1 });
  await assert.rejects(client.request('ErrorRequest'), (err) => err.code === 50 && !err.message.includes('secret-token'));
  assert.ok(mock.requests.every((r) => r.apiVersion === '1.0' && r.requestID.length < 64));
});

test('VTS limita esperas y rechaza pendientes al desconectar', async (t) => {
  const mock = await createMockVts(() => undefined);
  const client = createVtsClient({ port: mock.port, requestTimeoutMs: 30 });
  t.after(async () => { await client.disconnect(); await mock.close(); });
  await client.connect();
  await assert.rejects(client.request('WaitRequest'), { code: 'TIMEOUT' });
  const pending = assert.rejects(client.request('WaitRequest'), { code: 'DISCONNECTED' });
  await client.disconnect();
  await pending;
  await assert.rejects(client.request('WaitRequest'), { code: 'DISCONNECTED' });
});

async function envFixture(t) {
  const root = new URL('../../', import.meta.url);
  const dir = await fs.mkdtemp(new URL('.vts-test-', root));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return path.join(dir, '.env');
}

test('autenticacion guarda solo el token aprobado y reutiliza .env al reiniciar', async (t) => {
  const envPath = await envFixture(t);
  await fs.writeFile(envPath, '# config\r\nALBA_TOKEN=keep-me\r\nVTS_AUTH_TOKEN=old\r\nVTS_PORT=1234\r\n');
  const mock = await createMockVts(({ messageType, data }) => {
    if (messageType === 'AuthenticationTokenRequest') return { authenticationToken: 'approved-test-token' };
    return { authenticated: data.authenticationToken === 'approved-test-token' };
  });
  const client = createVtsClient({ port: mock.port });
  t.after(async () => { await client.disconnect(); await mock.close(); });
  await client.connect();
  const logger = { log() {} };
  await createVtsAuth({ envPath, logger }).authenticate(client);
  const content = await fs.readFile(envPath, 'utf8');
  assert.ok(content.includes('# config\r\nALBA_TOKEN=keep-me\r\n'));
  assert.equal(parse(content).VTS_PORT, '1234');
  assert.equal(await readAuthToken(envPath), 'approved-test-token');
  await createVtsAuth({ envPath, logger }).authenticate(client);
  assert.equal(mock.requests.filter((r) => r.messageType === 'AuthenticationTokenRequest').length, 1);
});

test('denegar autorizacion no modifica .env ni repite el popup', async (t) => {
  const envPath = await envFixture(t);
  await fs.writeFile(envPath, 'ALBA_TOKEN=keep-me\n');
  const mock = await createMockVts((_, respond) => {
    respond({ errorID: 50 }, 'APIError');
  });
  const client = createVtsClient({ port: mock.port });
  t.after(async () => { await client.disconnect(); await mock.close(); });
  await client.connect();
  const auth = createVtsAuth({ envPath, logger: { log() {} } });
  await assert.rejects(auth.authenticate(client), { code: 50 });
  await assert.rejects(auth.authenticate(client), { code: 'AUTH_DENIED' });
  assert.equal(mock.requests.length, 1);
  assert.equal(await fs.readFile(envPath, 'utf8'), 'ALBA_TOKEN=keep-me\n');
});

test('persistencia crea .env y elimina tokens duplicados sin permitir inyectar variables', async (t) => {
  const envPath = await envFixture(t);
  assert.equal(await readAuthToken(envPath), '');
  await saveAuthToken(envPath, 'test-token');
  assert.equal(await readAuthToken(envPath), 'test-token');
  await fs.writeFile(envPath, 'export VTS_AUTH_TOKEN=old\nVTS_AUTH_TOKEN=other\nALBA_TOKEN=keep');
  await saveAuthToken(envPath, 'replacement');
  assert.equal(await readAuthToken(envPath), 'replacement');
  assert.equal(parse(await fs.readFile(envPath, 'utf8')).ALBA_TOKEN, 'keep');
  await assert.rejects(saveAuthToken(envPath, 'bad\nALBA_TOKEN=bad'));
});