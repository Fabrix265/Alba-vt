# Referencia de configuración

Todo el comportamiento de Alba vive en `config/` y en `.env`.

- Los **JSON de `config/`** se recargan solos al guardar. Si uno queda inválido,
  Alba conserva la última versión válida y lo avisa en la terminal del bridge.
  Cada archivo se valida contra su schema en `config/schemas/` (los editores
  como VS Code autocompletan gracias al campo `$schema`).
- **`.env`** solo se lee al arrancar: reinicia `npm start` después de cambiarlo.

Para aprender con ejemplos, empieza por [Crea tus propias cosas](customize.md).

## `.env`

Copia `.env.example` a `.env`. Los valores por defecto están en `.env.example`.

| Variable | Para qué | Por defecto |
|---|---|---|
| `ALBA_ADAPTER` | Modo: `vtuber`, `pngtuber` o `fake` (alias `vts`, `pet`) | `vtuber` |
| `ALBA_TOKEN` | Clave que deben enviar los clientes. **Obligatoria**; inventa una larga y aleatoria | vacío |
| `ALBA_BRIDGE_PORT` | Puerto del bridge (solo 127.0.0.1) | `8790` |
| `VTS_PORT` | Puerto de la Plugin API de VTube Studio | `8001` |
| `VTS_AUTH_TOKEN` | Se rellena solo al aprobar el popup de VTS | vacío |
| `VTS_REQUEST_ITEM_PERMISSION` | Pedir el permiso de props al arrancar | `false` |
| `VTS_PROCESS_CONTROL` | Permitir cerrar/abrir VTS con `deep_sleep` (siempre pide confirmación) | `false` |
| `VTS_CLOSE_COMMAND` / `VTS_LAUNCH_COMMAND` | Arrays JSON `["ejecutable","arg"]`, sin shell | vacío |
| `ALBA_PET_PORT` | Puerto del canal local de la ventana PNGTuber | `8791` |
| `ALBA_PET_LAUNCH` | Abrir la ventana al arrancar el bridge | `true` |
| `ALBA_PET_TOKEN` | Clave de la ventana; vacío = usa `ALBA_TOKEN` | vacío |
| `ALBA_PET_WINDOW` | Tamaño fijo `anchoxalto` (100–4000); vacío = automático | vacío |

## `scenes.json`

Cada escena es un estado con nombre. El nombre es también la **intención** que
usan reglas, comandos y el MCP.

```json
"scenes": {
  "celebrate": { "layer": "transient", "durationMs": 3000, "clip": "celebrate", "parameters": { "smile": 0.85 } }
}
```

| Campo | Modo | Qué hace |
|---|---|---|
| `layer` | ambos | **Obligatorio.** `base`, `activity` o `transient` (ver [las capas](customize.md#las-tres-capas-de-una-escena)) |
| `durationMs` | ambos | Duración de un `transient`. Por defecto 2500; nunca menos que `minStateDurationMs` |
| `clip` | PNGTuber | Id del clip en `assets.json`. Si se omite, se busca un clip con el nombre de la escena |
| `talkingClip` | PNGTuber | Id del clip mientras habla |
| `hotkey` | VTuber | Reutiliza el binding de otra escena (`"hotkey": "celebrate"`) o un nombre de hotkey de VTS |
| `parameters` | VTuber | Plan B si no hay hotkey: `angleX`, `angleY`, `angleZ`, `smile`, `mouth`, `eyeOpen`, `eyeOpenRight`, `brow` (los alias de `bindings.json`) |
| `props` | VTuber | Ids de props que aparecen con la escena |
| `holdPoseWhileAsleep` | VTuber | Mantener `parameters` mientras duerme (escena `sleep`) |
| `parameterRefreshMs` | VTuber | Cada cuánto se renueva esa pose (50–500) |
| `description` | ambos | Nota para ti |

Escenas especiales: `idle` (reposo; si una intención no existe se usa esta), `sleep`, `deep_sleep` y
`wake`. `wake` siempre lleva a `idle`.

## `rules.json`

Reglas automáticas: evento → escena.

```json
{ "id": "herramienta-codigo", "when": { "type": "tool.start", "tool": ["bash", "edit"] },
  "intent": "coding", "cooldownMs": 2500, "debounceMs": 500 }
```

| Campo | Qué hace |
|---|---|
| `id` | **Obligatorio.** Nombre único de la regla |
| `intent` | **Obligatorio.** Escena que se pide |
| `when.type` | Tipo de evento (texto o lista): `tool.start`, `tool.end`, `session.start`, `session.idle`, `error`, `say`, `custom` |
| `when.tool` | Nombre de herramienta (texto o lista) |
| `when.source` | Quién envía (`opencode`, `mcp`, `demo`, `http`…) |
| `when.ok` | `true` / `false` |
| `when.textIncludes` | El texto del evento contiene esto (sin distinguir mayúsculas) |
| `when.state` | Condición sobre el estado de Alba: `asleep`, `deepSleep`, `effective`, `base`, `activity` (acepta `null`) |
| `priority` | Si varias reglas coinciden, gana el número más alto (por defecto 0) |
| `cooldownMs` | Tiempo mínimo entre dos disparos de esta regla |
| `debounceMs` | Ignora eventos que llegan más rápido que esto |
| `window` | `{ "count": N, "ms": T }`: dispara solo con N eventos en T ms |
| `args.props` | Props a mostrar (`[]` los quita, `null` conserva los actuales) |

Solo se dispara una regla por evento. Mientras Alba duerme, ningún evento
dispara reglas. Una regla nunca puede cerrar procesos: `deep_sleep` desde una
regla se ignora.

## `commands.json`

Frases de la CLI: `alba <frase>`.

```json
"commands": { "hello": { "intent": "celebrate", "description": "Saludo" } }
```

| Campo | Qué hace |
|---|---|
| `intent` | **Obligatorio.** Escena que se pide |
| `description` | Aparece en `alba list` |
| `confirm` | `true` pide confirmación y/N antes de ejecutar |
| `args.props` | Props a mostrar |

Nombres reservados por la CLI: `list`, `status`, `hotkeys`, `help`, `--help`,
`--yes`. Más en [Añadir y personalizar comandos](adding-a-command.md).

## `bindings.json`

Cómo se traduce cada escena a tu modelo de VTube Studio. Ver
[Añadir un modelo Live2D](adding-a-model.md).

| Campo | Qué hace |
|---|---|
| `default.parameters` | Alias → parámetro de entrada de VTS, comunes a todos los modelos |
| `default.hotkeys` | Escena → hotkey común (normalmente vacío) |
| `models.<clave>.match` | Nombres o IDs de modelo que usan esta entrada |
| `models.<clave>.hotkeys` | Escena → ID o nombre de hotkey de ese modelo |
| `models.<clave>.parameters` | Sobrescribe alias de `default` para ese modelo |

## `assets.json`

Recursos por id. Ver [Añadir un recurso](adding-an-asset.md).

| Campo | Qué hace |
|---|---|
| `type` | **Obligatorio.** `clip` (PNGTuber) o `item` (prop VTuber) |
| `file` | **Obligatorio.** Ruta dentro de `assets/` |
| `fit`, `loop` | Clips: ajuste y repetición |
| `position`, `size`, `layer` | Props: posición, tamaño y capa |
| `description` | Nota para ti |

## `persona.json`

| Campo | Qué hace | Por defecto |
|---|---|---|
| `name` | Nombre del personaje | `Alba` |
| `character` | Descripción libre | — |
| `limits.minStateDurationMs` | Tiempo mínimo en una escena antes de cambiar | 1200 |
| `limits.maxTransientsPerMinute` | Reacciones cortas permitidas por minuto | 6 |
