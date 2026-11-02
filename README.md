# Alba-vt

**Una presencia VTuber para tu agente de código.**

Alba es un personaje 2D (Live2D, renderizado por [VTube Studio](https://denchisoft.com/)) que reacciona en tiempo real a lo que hace tu agente: se pone a teclear cuando programa, se enoja o se pone triste cuando hay errores, celebra cuando termina, y se va a dormir cuando se lo pides. No es un chatbot aparte: es la cara del agente que ya usas.

> **Estado:** en desarrollo (Fase 0). Proyecto no oficial: no está afiliado a VTube Studio, Live2D, opencode ni Anthropic.

## Qué hace

- **Reacciona a tu agente.** Eventos como "ejecutando un comando", "editando un archivo" o "error" se convierten en expresiones, movimientos y objetos en pantalla.
- **Tranquila por diseño.** Cooldowns, duraciones mínimas y *debounce* evitan que parpadee con cada evento.
- **Dormir y despertar.** `sleep` la pausa con VTube Studio abierto; `deep_sleep` cierra VTube Studio para liberar recursos.
- **Todo es configuración.** Comportamientos, comandos, props y modelos se agregan editando JSON, con recarga en caliente. No hay que tocar código.
- **Cambia de avatar.** Cada modelo tiene sus propios *bindings*; si le falta una expresión, Alba degrada con parámetros estándar en vez de romperse.
- **Agnóstico al agente.** El núcleo no sabe quién le habla. Hoy: opencode. Pensado para Claude Code, Codex y cualquier cosa que pueda hacer un POST.

## Cómo funciona

```
 opencode / Claude Code / Codex / curl / CLI
                 │  (eventos nativos)
                 ▼
        clients/*  ── traducen a ──►  evento canónico
                                          │
                                          ▼
                     Bridge local (127.0.0.1:8790)
        rules.json ► director de escena (base · activity · transient · props)
                                          │  (intenciones: "coding", "error"…)
                                          ▼
                        adapters/vts  ──►  VTube Studio (WebSocket, puerto 8001)
```

- El **plugin del agente es tonto**: solo reenvía eventos por HTTP. La lógica vive en el bridge, así que cambias el comportamiento sin reiniciar el agente.
- El bridge envía **intenciones**, no comandos de VTube Studio. El adapter las traduce según el modelo cargado.

## Requisitos

- Node.js 24 o superior
- [VTube Studio](https://store.steampowered.com/app/1325860/VTube_Studio/) instalado, con un modelo cargado
- Un agente compatible (opencode por ahora) o cualquier cliente HTTP
- Opcional: imágenes PNG para los props (teclado, taza…)

## Instalación

```bash
git clone <url-del-repo> alba-vt
cd alba-vt
npm install
cp .env.example .env      # en Windows (cmd): copy .env.example .env
```

### 1. Habilitar la Plugin API de VTube Studio

1. Abre VTube Studio y carga un modelo.
2. Ve a ⚙ → página principal de configuración.
3. Activa **Allow Plugin API access** (puerto 8001 por defecto).

### 2. Verificar y autorizar

```bash
npm run doctor
```

La primera vez, VTube Studio mostrará un popup pidiendo aprobar el plugin: acéptalo. El token resultante se guarda en tu `.env` local (nunca se sube al repo).

`doctor` comprueba Node, la conexión con VTube Studio, la autenticación, el modelo cargado, sus hotkeys reales, los parámetros de entrada, los permisos disponibles y qué recursos (PNG) están presentes o faltan, y te dice cómo arreglar cada problema.

### 3. Arrancar

```bash
npm start      # arranca el bridge
npm run demo   # eventos de prueba: idle → thinking → coding → celebrate → idle
```

## Configuración

### Variables de entorno (`.env`)

| Variable | Para qué sirve | Valor por defecto |
|---|---|---|
| `VTS_PORT` | Puerto de la Plugin API de VTube Studio | `8001` |
| `VTS_AUTH_TOKEN` | Token de plugin (se rellena solo tras aprobar el popup) | vacío |
| `ALBA_BRIDGE_PORT` | Puerto del bridge (solo loopback) | `8790` |
| `ALBA_TOKEN` | Token que deben enviar los clientes en `X-Alba-Token` | generado por ti |
| `VTS_LAUNCH_COMMAND` | Cómo reabrir VTube Studio al despertar de `deep_sleep` | vacío |

### Archivos de `config/` (recarga en caliente)

Si un JSON queda inválido, se conserva la última configuración válida y se registra el error.

| Archivo | Qué define |
|---|---|
| `persona.json` | Nombre y carácter de Alba, umbrales de "tranquilidad" |
| `scenes.json` | Escenas: qué intención activa qué expresión, movimiento y props |
| `rules.json` | Reglas evento → intención, con cooldown, debounce y contadores por ventana de tiempo |
| `bindings.json` | Mapa intención → hotkeys/parámetros, **por modelo** (con entrada `default`) |
| `assets.json` | Registro de recursos por id (PNG de props, y más tipos a futuro) |
| `commands.json` | Comandos del CLI `alba`: frase → intención |
| `schemas/` | JSON Schemas para validar y autocompletar los archivos anteriores |

Referencia completa en [`docs/config-reference.md`](docs/config-reference.md).

## Uso

### Comandos de terminal

```bash
alba good night    # sleep: Alba duerme y deja de reaccionar
alba ring ring     # wake: la despierta
alba lights out    # deep_sleep: cierra VTube Studio (pide confirmación)
alba focus         # modo programar, con teclado
alba tea time      # modo descanso, con taza
alba oops          # reacción de error
alba cheer         # celebración
alba hello         # saludo
alba list          # muestra todos los comandos disponibles
```

Los nombres son tuyos: edita `config/commands.json` y listo. Para tener `alba` disponible globalmente: `npm link` (modifica tu entorno fuera del proyecto, hazlo a conciencia).

### Dormir y despertar

| Nivel | Qué hace | Cuándo usarlo |
|---|---|---|
| `sleep` | Escena de dormir; ignora eventos; VTube Studio y bridge siguen abiertos | Quieres usar el agente sin Alba reaccionando |
| `deep_sleep` | Además cierra VTube Studio | Necesitas los recursos de la PC |
| `wake` | Vuelve a `idle` desde cualquiera de los dos | — |

Para despertar desde `deep_sleep`, configura `VTS_LAUNCH_COMMAND` (ruta del ejecutable o URL de Steam). Si no está configurado, `alba ring ring` te pedirá abrir VTube Studio a mano y Alba reconectará sola.

### Conectar tu agente

> Las instrucciones exactas de instalación de cada cliente se completan en el Paso 5 del plan de desarrollo.

- **opencode:** el plugin de `clients/opencode/` reenvía `tool.execute.before/after` y `session.idle` al bridge.
- **MCP:** `clients/mcp/` expone `avatar_status`, `avatar_say`, `avatar_scene`, `avatar_hotkey`, `avatar_sleep` y `avatar_wake`. Son voluntarias: el agente solo las usa si se lo indicas (por ejemplo, en tu `AGENTS.md`).
- **HTTP:** cualquier cosa que haga POST. Ejemplos en [`clients/http/examples.md`](clients/http/examples.md).

```bash
curl -X POST http://127.0.0.1:8790/intent \
  -H "Content-Type: application/json" \
  -H "X-Alba-Token: $ALBA_TOKEN" \
  -d '{"intent":"celebrate"}'
```

Endpoints: `POST /event`, `POST /intent`, `GET /state`, `GET /stream` (SSE).

## Personalizar

- **Cambiar de modelo:** carga otro en VTube Studio y añade su entrada en `config/bindings.json`. Guía: [`docs/adding-a-model.md`](docs/adding-a-model.md).
- **Agregar un comando:** una línea en `config/commands.json`. Guía: [`docs/adding-a-command.md`](docs/adding-a-command.md).
- **Agregar un prop o recurso:** suelta el PNG en `assets/props/` y registra su id en `config/assets.json`. Si el archivo falta, el recurso simplemente no aparece. Guía: [`docs/adding-an-asset.md`](docs/adding-an-asset.md).
- **Agregar un cliente nuevo:** basta con traducir sus eventos al esquema canónico. Guía: [`docs/adding-a-client.md`](docs/adding-a-client.md).

## Solución de problemas

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `doctor` no conecta con VTube Studio | Plugin API desactivada | Actívala en ⚙ → página principal → *Allow Plugin API access* |
| No aparece el popup de autorización | VTube Studio sin foco o popup oculto | Reintenta `npm run doctor` con VTube Studio en primer plano |
| Una intención no hace nada | El modelo no tiene ese hotkey | Revisa `doctor` y añade el binding de ese modelo |
| El teclado o la taza no aparecen | Falta el PNG o el permiso de items | `doctor` lista qué falta; sin ellos todo lo demás funciona |
| Alba parpadea con cada comando | Reglas sin cooldown | Sube `cooldown` o `debounce` en `rules.json` |
| VTube Studio cerrado | — | El bridge sigue vivo y registra la degradación; Alba vuelve al reabrirlo |

## Estructura del proyecto

```
config/     configuración JSON (+ schemas/)
src/core/   bus, director de escena, reglas, config, assets, speech
src/platform/   cerrar/lanzar VTS según el sistema operativo (configurable)
src/api/    bridge HTTP
src/adapters/   vts/ (VTube Studio) y fake/ (sin VTS, para demos y tests)
clients/    opencode/ · mcp/ · http/ · cli/
scripts/    doctor y demo
test/       pruebas
docs/       guías
assets/     modelos y PNG (ignorados por git)
```

## Seguridad

- El bridge escucha **solo en 127.0.0.1**.
- Exige `Content-Type: application/json`, un token en el header `X-Alba-Token` y rechaza peticiones con `Origin` de navegador, para que ninguna página web pueda controlarlo.
- Los tokens viven únicamente en `.env`, que está ignorado por git.

## Arte y licencias

El **código** es [MIT](LICENSE). El **arte no se distribuye con este repositorio**: los modelos Live2D y las imágenes de terceros viven en `assets/`, que git ignora. Cada modelo tiene su propia licencia: respétala y anótala en [`CREDITS.md`](CREDITS.md) (autor, enlace y licencia).

## Roadmap

- **Fase 0:** núcleo, adapter de VTube Studio, doctor, integración con opencode y MCP, demo, dormir/despertar.
- **Fase 2:** voz (edge-tts, con SAPI de Windows como respaldo) y lip-sync por amplitud de audio.
- **Más adelante:** overlay propio para props, recursos de sonido, atajo global para dormir, más clientes (Claude Code, Codex).
- **Final:** instalación con un comando, guías completas, tests y CI, paquete de avatar compartible.

## Contribuir

Aún no hay guía de contribución; llegará antes de la publicación. Mientras tanto, si encuentras un problema, abre un issue con la salida de `npm run doctor`.