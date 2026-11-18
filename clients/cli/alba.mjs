#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { createBridgeClient } from '../http/client.mjs';
import { isMain } from '../../src/environment.mjs';

async function askConfirmation() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { return /^(y|s|yes|si)$/i.test((await rl.question('Autorizar esta operacion (puede cerrar o lanzar VTS)? [y/N] ')).trim()); }
  finally { rl.close(); }
}

export function formatAgo(ms) {
  if (!Number.isFinite(ms)) return 'hace un momento';
  const seconds = Math.round(ms / 1000);
  if (seconds < 2) return 'ahora mismo';
  if (seconds < 60) return `hace ${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  return `hace ${Math.round(minutes / 60)} h`;
}

function describeAdapter(adapter = {}) {
  if (adapter.name === 'pngtuber') {
    const clients = adapter.clients ?? 0;
    if (!adapter.connected) return 'pngtuber | el canal de la ventana no pudo arrancar (revisa ALBA_PET_PORT)';
    return clients > 0
      ? `pngtuber | ventana conectada${clients > 1 ? ` (${clients} ventanas)` : ''}`
      : 'pngtuber | ventana sin conectar (abre npm run pet o revisa ALBA_PET_LAUNCH)';
  }
  if (adapter.name === 'vtuber') {
    if (!adapter.connected) return 'vtuber | VTube Studio desconectado (abrelo y activa la Plugin API)';
    return adapter.model?.modelLoaded
      ? `vtuber | VTube Studio conectado, modelo ${adapter.model.modelName}`
      : 'vtuber | VTube Studio conectado, sin modelo cargado';
  }
  return `${adapter.name ?? 'desconocido'} | sin avatar visible`;
}

// Resumen legible de /state: modo, escena y que agentes han enviado eventos.
export function formatStatus(state) {
  const lines = [
    'Bridge: activo',
    `Modo: ${describeAdapter(state.adapter)}`,
    `Alba: ${state.asleep ? (state.deepSleep ? 'en sueno profundo' : 'dormida (ignora eventos)') : 'despierta'} | escena ${state.effective}`
  ];
  const sources = Object.entries(state.events?.sources ?? {});
  if (!sources.length) {
    lines.push('Eventos: todavia no llego ninguno.',
      '  Si usas opencode, abrelo desde la carpeta de Alba y pidele algo; consulta docs/opencode.md.');
    return lines;
  }
  lines.push(`Eventos recibidos (${state.events.total} en total):`);
  for (const [source, entry] of sources) {
    const last = entry.last;
    const detail = `${last.type}${last.tool ? ` (${last.tool})` : ''}${last.ignored ? ', ignorado porque dormia' : ''}`;
    lines.push(`  ${source}: ${entry.count} | ultimo ${detail} ${formatAgo(last.agoMs)}`);
  }
  return lines;
}

export async function runCli(args, { client = createBridgeClient(), write = console.log, confirm = askConfirmation } = {}) {
  const yes = args.includes('--yes');
  const phrase = args.filter((arg) => arg !== '--yes').join(' ').trim();
  if (!phrase || phrase === '--help' || phrase === 'help') {
    write('Uso: alba <frase> [--yes] | alba list | alba status | alba hotkeys\nLocal: npm run alba -- <frase>\n--yes: solo cuando el usuario autoriza expresamente esta operacion.');
    return 0;
  }
  const { state } = await client.state();
  if (phrase === 'status') {
    for (const line of formatStatus(state)) write(line);
    return 0;
  }
  if (phrase === 'hotkeys') {
    const adapter = state.adapter;
    if (adapter?.capabilities?.hotkeys !== true) {
      const mode = adapter?.name ?? 'desconocido';
      write(`Hotkeys no disponibles: el modo ${mode} no expone hotkeys${mode === 'pngtuber' ? '; usa los clips de la ventana' : ''}.`);
      return 1;
    }
    if (!adapter.connected) {
      write('VTS desconectado: comprueba que este abierto y con la API activa.');
      return 1;
    }
    if (!adapter.model?.modelLoaded) {
      write('No hay un modelo cargado en VTS.');
      return 1;
    }
    write(`Modelo: ${adapter.model.modelName} (${adapter.model.modelID})`);
    const hotkeys = adapter.hotkeys ?? [];
    if (!hotkeys.length) {
      write('El bridge no tiene hotkeys disponibles para este modelo.');
      return 0;
    }
    write('Nombre | ID');
    for (const hotkey of hotkeys) write(`${hotkey.name?.trim() || '(sin nombre)'} | ${hotkey.hotkeyID}`);
    return 0;
  }
  if (phrase === 'list') {
    for (const [name, entry] of Object.entries(state.commands)) write(`${name} -> ${entry.intent}${entry.confirm ? ' [confirmacion]' : ''} | ${entry.description ?? ''}`);
    return 0;
  }
  if (!Object.hasOwn(state.commands, phrase)) throw new Error('Comando desconocido; usa alba list');
  const entry = state.commands[phrase];
  const needsConfirmation = entry.confirm || entry.intent === 'deep_sleep' ||
    (entry.intent === 'wake' && state.deepSleep && state.processControl.canLaunch);
  if (needsConfirmation && !yes && !await confirm()) {
    write('Cancelado: se requiere confirmacion explicita; en una terminal interactiva responde y/N.');
    return 1;
  }
  const result = await client.intent({ command: phrase, confirmed: needsConfirmation ? true : yes });
  write(`${phrase}: ${result.state.effective}${result.applied?.applied === false ? ` (${result.applied.reason})` : ''}`);
  if (result.notice) write(result.notice);
  return 0;
}

if (isMain(import.meta.url)) {
  try { process.exitCode = await runCli(process.argv.slice(2)); }
  catch (error) { console.error(`Alba: ${error.message}`); process.exitCode = 1; }
}
