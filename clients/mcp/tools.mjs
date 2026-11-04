import { validate } from '../../src/core/validate.mjs';

const text = { type: 'string', minLength: 1, maxLength: 4000 };
const confirmed = { type: 'boolean', description: 'true solo tras permiso explicito del usuario para esta operacion.' };
const schema = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const definition = (name, description, inputSchema, readOnly = false) => ({ name, description, inputSchema,
  annotations: { readOnlyHint: readOnly, destructiveHint: !readOnly, idempotentHint: readOnly, openWorldHint: false } });

export const toolDefinitions = [
  definition('avatar_status', 'Consulta estado, escenas, comandos y conexion de Alba/VTS. No cambia nada.', schema(), true),
  definition('avatar_say', 'Mueve la boca con lip-sync sintetico, sin audio en Fase 0. Se ignora mientras Alba duerme.', schema({ text }, ['text'])),
  definition('avatar_scene', 'Solicita una intencion/escena por id de avatar_status; el director aplica limites y prioridades.', schema({ scene: text, props: { type: 'array', items: text, maxItems: 32 } }, ['scene'])),
  definition('avatar_hotkey', 'Activa una intencion mediante su binding del modelo (solo modo vtuber); usa parametros de respaldo si falta el hotkey. No acepta ids ni nombres crudos de VTS.', schema({ intent: text }, ['intent'])),
  definition('avatar_sleep', 'Pausa Alba. Con deep=true puede cerrar VTS: pide primero permiso explicito al usuario para esta operacion; luego confirmed=true. Sin control configurado solo pausa.', schema({ deep: { type: 'boolean' }, confirmed })),
  definition('avatar_wake', 'Despierta Alba. Si deep_sleep requiere lanzar VTS, pide permiso explicito antes de confirmed=true. Sin launcher se abre VTS manualmente.', schema({ confirmed }))
];

export function validateToolCall(params) {
  const definition = toolDefinitions.find((item) => item.name === params?.name);
  if (!definition) throw Object.assign(new Error('Herramienta desconocida; consulta tools/list'), { rpcCode: -32602 });
  const args = params.arguments === undefined ? {} : params.arguments;
  const errors = validate(definition.inputSchema, args);
  if (errors.length) throw Object.assign(new Error('Argumentos invalidos; consulta el inputSchema de tools/list'), { rpcCode: -32602 });
  return args;
}

export async function callTool(client, name, args) {
  let result;
  switch (name) {
    case 'avatar_status': result = await client.state(); break;
    case 'avatar_say': result = await client.event({ source: 'mcp', type: 'say', text: args.text }); break;
    case 'avatar_scene': result = await client.intent({ intent: args.scene, ...(args.props ? { props: args.props } : {}) }); break;
    case 'avatar_hotkey': result = await client.intent({ intent: args.intent }); break;
    case 'avatar_sleep': result = await client.intent({ intent: args.deep ? 'deep_sleep' : 'sleep', confirmed: args.confirmed === true }); break;
    case 'avatar_wake': result = await client.intent({ intent: 'wake', confirmed: args.confirmed === true }); break;
    default: throw new Error('Herramienta desconocida');
  }
  return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: false };
}
