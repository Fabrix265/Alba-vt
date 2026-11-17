#!/usr/bin/env node
import { StringDecoder } from 'node:string_decoder';
import { once } from 'node:events';
import { createBridgeClient } from '../http/client.mjs';
import { isMain } from '../../src/environment.mjs';
import { toolDefinitions, validateToolCall, callTool } from './tools.mjs';

const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const MAX_LINE_BYTES = 64 * 1024;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export async function serve({ input = process.stdin, output = process.stdout, client = createBridgeClient({ timeoutMs: 15000 }) } = {}) {
  let initialized = false;
  let ready = false;
  async function send(message) {
    if (!output.write(JSON.stringify(message) + '\n')) await once(output, 'drain');
  }
  const failure = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });
  async function handle(line) {
    let request;
    try { request = JSON.parse(line); } catch { await failure(null, -32700, 'JSON invalido'); return; }
    const hasId = object(request) && Object.hasOwn(request, 'id');
    const validId = typeof request?.id === 'string' || Number.isSafeInteger(request?.id);
    if (!object(request) || request.jsonrpc !== '2.0' || typeof request.method !== 'string' ||
        (hasId && !validId) || (request.params !== undefined && !object(request.params))) {
      await failure(validId ? request.id : null, -32600, 'Solicitud JSON-RPC invalida'); return;
    }
    if (!hasId) {
      if (request.method === 'notifications/initialized' && initialized) ready = true;
      return; // Notifications, including cancellation, never receive responses.
    }
    try {
      let result;
      if (request.method === 'ping') result = {};
      else if (request.method === 'initialize') {
        if (initialized || typeof request.params?.protocolVersion !== 'string' ||
            !object(request.params?.capabilities) || typeof request.params?.clientInfo?.name !== 'string' ||
            typeof request.params?.clientInfo?.version !== 'string') {
          throw Object.assign(new Error('initialize invalido o repetido'), { rpcCode: -32602 });
        }
        initialized = true;
        result = { protocolVersion: VERSIONS.includes(request.params.protocolVersion) ? request.params.protocolVersion : VERSIONS[0],
          capabilities: { tools: {} }, serverInfo: { name: 'alba', version: '0.1.0' },
          instructions: 'Herramientas voluntarias para Alba. No autorices cierres o lanzamientos de VTS sin permiso explicito del usuario.' };
      } else {
        if (!ready) throw Object.assign(new Error('Completa initialize y notifications/initialized'), { rpcCode: -32002 });
        if (request.method === 'tools/list') {
          let tools = toolDefinitions;
          let timer;
          const snapshot = await Promise.race([
            client.state().catch(() => null),
            new Promise((resolve) => { timer = setTimeout(() => resolve(null), 800); timer.unref?.(); })
          ]);
          clearTimeout(timer);
          if (snapshot?.state?.adapter?.capabilities && snapshot.state.adapter.capabilities.hotkeys !== true) {
            tools = tools.filter((tool) => tool.name !== 'avatar_hotkey');
          }
          result = { tools };
        }
        else if (request.method === 'tools/call') {
          const args = validateToolCall(request.params);
          try { result = await callTool(client, request.params.name, args); }
          catch (error) {
            const message = error.statusCode === 409 ? 'Se requiere confirmacion explicita del usuario para cerrar o lanzar VTS.' :
              error.statusCode === 400 ? 'Intencion o argumentos rechazados; consulta avatar_status.' :
              'Bridge no disponible o solicitud rechazada; comprueba npm start, ALBA_TOKEN y ALBA_BRIDGE_PORT.';
            result = { content: [{ type: 'text', text: message }], isError: true };
          }
        } else throw Object.assign(new Error('Metodo no soportado'), { rpcCode: -32601 });
      }
      await send({ jsonrpc: '2.0', id: request.id, result });
    } catch (error) {
      await failure(request.id, error.rpcCode ?? -32603, error.rpcCode ? error.message : 'Error interno');
    }
  }
  const decoder = new StringDecoder('utf8');
  let buffer = '';
  // Serial processing preserves tool order and naturally backpressures stdin.
  for await (const chunk of input) {
    buffer += typeof chunk === 'string' ? chunk : decoder.write(chunk);
    let index;
    while ((index = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (Buffer.byteLength(line) > MAX_LINE_BYTES) throw new Error('Mensaje MCP demasiado grande');
      if (line) await handle(line);
    }
    if (Buffer.byteLength(buffer) > MAX_LINE_BYTES) throw new Error('Mensaje MCP demasiado grande');
  }
  buffer += decoder.end();
  if (buffer.trim()) await failure(null, -32700, 'Mensaje incompleto: falta salto de linea');
}

if (isMain(import.meta.url)) {
  try { await serve(); }
  catch { console.error('Alba MCP: transporte cerrado o configuracion invalida'); process.exitCode = 1; }
}
