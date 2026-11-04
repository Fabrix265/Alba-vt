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

export async function runCli(args, { client = createBridgeClient(), write = console.log, confirm = askConfirmation } = {}) {
  const yes = args.includes('--yes');
  const phrase = args.filter((arg) => arg !== '--yes').join(' ').trim();
  if (!phrase || phrase === '--help' || phrase === 'help') {
    write('Uso: alba <frase> [--yes] | alba list | alba hotkeys\nLocal: npm run alba -- <frase>\n--yes: solo cuando el usuario autoriza expresamente esta operacion.');
    return 0;
  }
  const { state } = await client.state();
  if (phrase === 'hotkeys') {
    const adapter = state.adapter;
    if (adapter?.name !== 'vtuber') {
      write('Hotkeys no disponibles: el bridge no esta usando el modo VTuber.');
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
