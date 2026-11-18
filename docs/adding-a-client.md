# Añadir un cliente (otro agente u otra herramienta)

Un **cliente** es cualquier cosa que le cuenta a Alba lo que pasa: hoy, el
plugin de opencode, el servidor MCP, la CLI `alba` y cualquier `curl`. El bridge
no sabe ni le importa quién le habla: solo entiende **eventos canónicos**.

## La regla de oro

El cliente es **tonto**: traduce los eventos de su agente al formato canónico y
los envía por HTTP. Nada más. Qué cara pone Alba lo deciden las reglas de
`config/rules.json`, no el cliente.

## El evento canónico

```json
{
  "source": "mi-agente",
  "type": "tool.start",
  "tool": "bash",
  "ok": null,
  "text": null,
  "meta": {}
}
```

| Campo | Valores |
|---|---|
| `source` | Nombre corto del cliente. Aparece en `alba status` y en `when.source` de las reglas |
| `type` | `tool.start`, `tool.end`, `session.start`, `session.idle`, `error`, `say`, `custom` |
| `tool` | Nombre de la herramienta, o `null` |
| `ok` | `true` / `false` / `null` |
| `text` | Solo para `say` (lo que dice Alba) o para reglas con `textIncludes` |
| `meta` | Objeto libre; las reglas no lo leen |

**Privacidad:** envía solo lo necesario. El plugin de opencode, por ejemplo,
nunca envía argumentos, salidas ni contenido de archivos.

## Cómo enviarlo

`POST http://127.0.0.1:<ALBA_BRIDGE_PORT>/event` con:

- `Content-Type: application/json`
- `X-Alba-Token: <ALBA_TOKEN>`
- Sin cabecera `Origin` (el bridge rechaza navegadores).

En Node, reutiliza el cliente compartido, que ya lee `.env`:

```js
import { createBridgeClient } from '../http/client.mjs';

const alba = createBridgeClient();
await alba.event({ source: 'mi-agente', type: 'tool.start', tool: 'bash' });
```

Más ejemplos (PowerShell, bash) en [`clients/http/examples.md`](../clients/http/examples.md).

## Estructura recomendada

```
clients/mi-agente/
  plugin.mjs      # se engancha a los hooks del agente y llama al traductor
  translate.mjs   # función pura: evento nativo -> evento canónico (o null)
  README.md       # cómo activarlo
test/clients/mi-agente.test.mjs
```

Toma como modelo [`clients/opencode/`](../clients/opencode/):

- `translate.mjs` es una función pura, fácil de probar sin bridge.
- `plugin.mjs` encola los eventos para no bloquear al agente, avisa **una vez**
  si el bridge no responde y nunca lanza errores hacia el agente.

## Comprobar

1. `npm start`.
2. Usa tu agente.
3. `npm run alba -- status`: debe aparecer una línea con tu `source`.
