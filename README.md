# Alba-vt

**Una presencia VTuber o PNGTuber para tu agente de código.**

Alba es un personaje 2D que reacciona en tiempo real a lo que hace tu agente: se pone a teclear cuando programa, se enoja o se pone triste cuando hay errores, celebra cuando termina, y se va a dormir cuando se lo pides. Puede ser un modelo Live2D en [VTube Studio](https://denchisoft.com/) o una ventana PNGTuber transparente en tu escritorio. No es un chatbot aparte: es la cara del agente que ya usas.

> **Estado:** Fase 0 cerrada y modos VTuber/PNGTuber implementados como fases 1–4. Incluye bridge, adapter VTube Studio, adapter PNGTuber con ventana Electron, doctor por modo, plugin de opencode, CLI, HTTP, MCP por stdio sin SDK y demo. Consulta la [revisión de Fase 0](docs/phase-0-review.md) y la [guía PNGTuber](docs/pngtuber.md). Proyecto no oficial: no está afiliado a VTube Studio, Live2D, opencode ni Anthropic.

## Qué hace

- **Reacciona a tu agente.** Eventos como "ejecutando un comando", "editando un archivo" o "error" se convierten en expresiones, movimientos y objetos en pantalla.
- **Dos modos, el mismo motor.** `vtuber` usa Live2D y VTube Studio; `pngtuber` usa clips y una ventana de escritorio. El modo `fake` sirve para demos y tests sin abrir nada.
- **Tranquila por diseño.** Cooldowns, duraciones mínimas y *debounce* evitan que parpadee con cada evento.
- **Dormir y despertar.** `sleep` la pausa; `deep_sleep` puede cerrar VTube Studio si habilitas el control de procesos y confirmas esa operación. Por defecto se degrada a `sleep`.
- **Todo es configuración.** Comportamientos, comandos, props, clips y modelos se agregan editando JSON, con recarga en caliente. No hay que tocar código.
- **Cambia de avatar.** Cada modelo Live2D tiene sus propios *bindings*; si le falta una expresión, Alba degrada con parámetros estándar en vez de romperse. En PNGTuber, cada escena elige un clip.
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
                        adapter vtuber  ──►  VTube Studio (WebSocket, puerto 8001)
                        adapter pngtuber ──►  ventana Electron (WebSocket, puerto 8791)
                        adapter fake    ──►  registro para demo y tests
```

- El **plugin del agente es tonto**: solo reenvía eventos por HTTP. La lógica vive en el bridge, así que cambias el comportamiento sin reiniciar el agente.
- El bridge envía **intenciones**, no comandos de VTube Studio. Cada adapter las traduce a su propio medio.

## Requisitos

- Node.js 24 o superior
- Un agente compatible (opencode por ahora) o cualquier cliente HTTP
- **Modo VTuber:** [VTube Studio](https://store.steampowered.com/app/1325860/VTube_Studio/) instalado, con un modelo cargado
- **Modo PNGTuber:** clips propios en `assets/pngtuber/` y Electron (se instala como dependencia opcional con `npm install`)
- Opcional en VTuber: imágenes PNG para los props (teclado, taza…)

## Instalación

```bash
git clone <url-del-repo> alba-vt
cd alba-vt
npm install
cp .env.example .env      # en Windows (cmd): copy .env.example .env
```

### 1. Elegir modo

En `.env`, `ALBA_ADAPTER` acepta `vtuber` (VTube Studio), `pngtuber` (ventana de escritorio con clips) o `fake` (sin ventanas ni conexiones). Los alias antiguos `vts` y `pet` siguen funcionando. El modo PNGTuber se explica en su [guía](docs/pngtuber.md).

### 2. Habilitar la Plugin API de VTube Studio

Solo para `ALBA_ADAPTER=vtuber`.

1. Abre VTube Studio y carga un modelo.
2. Ve a ⚙ → página principal de configuración.
3. Activa **Allow Plugin API access** (puerto 8001 por defecto).

### 3. Verificar y autorizar

Ejecuta `npm run doctor` para verificar la instalacion y autorizar Alba. Usa `npm run doctor -- --json` si necesitas el informe estructurado. Los avisos sobre PNG o permisos opcionales no impiden usarla; los errores devuelven un codigo de salida distinto de cero.

```bash
npm run doctor
```

La primera vez, VTube Studio mostrará un popup pidiendo aprobar el plugin: acéptalo. El token resultante se guarda en tu `.env` local (nunca se sube al repo).

`doctor` adapta sus comprobaciones al modo elegido. En VTuber revisa Node, VTube Studio, la autenticación, el modelo, sus hotkeys reales, los parámetros de entrada y los permisos. En PNGTuber revisa el puerto, el token, Electron y los clips declarados. En ambos modos valida la configuración y qué recursos están presentes o faltan, y te dice cómo arreglar cada problema.

### 4. Arrancar

```bash
npm start      # arranca el bridge (y la ventana si ALBA_ADAPTER=pngtuber)
npm run pet    # abre solo la ventana PNGTuber
npm run demo   # en otra terminal: idle → thinking → coding → celebrate → idle
npm run demo -- --fake   # sin bridge, VTS ni conexiones; reloj acelerado
```

La [demo](docs/demo.md) envía eventos, respeta los tiempos del director y funciona sin PNG ni clips. Si VTS está desconectado, muestra los estados del bridge; para comprobar la animación debes tener VTube Studio conectado. En PNGTuber, el bridge abre la ventana automáticamente salvo que `ALBA_PET_LAUNCH=false`.

## Configuración

### Variables de entorno (`.env`)

| Variable | Para qué sirve | Valor por defecto |
|---|---|---|
| `ALBA_ADAPTER` | Modo de avatar: `vtuber`, `pngtuber` o `fake`; alias `vts` y `pet` | `vtuber` |
| `VTS_REQUEST_ITEM_PERMISSION` | Solicitar permiso de PNG externos al arrancar | `false` |
| `VTS_PORT` | Puerto de la Plugin API de VTube Studio | `8001` |
| `VTS_AUTH_TOKEN` | Token de plugin (se rellena solo tras aprobar el popup) | vacío |
| `ALBA_PET_PORT` | Puerto WebSocket local de la ventana PNGTuber | `8791` |
| `ALBA_PET_LAUNCH` | Abrir la ventana PNGTuber al arrancar el bridge | `true` |
| `ALBA_PET_TOKEN` | Token del WebSocket del pet; si está vacío usa `ALBA_TOKEN` | vacío |
| `ALBA_BRIDGE_PORT` | Puerto del bridge (solo loopback) | `8790` |
| `ALBA_TOKEN` | Token que deben enviar los clientes en `X-Alba-Token` | generado por ti |
| `VTS_PROCESS_CONTROL` | Habilitar cierre/lanzamiento, siempre con confirmación por operación | `false` |
| `VTS_CLOSE_COMMAND` | Array JSON de ejecutable y argumentos para cerrar exclusivamente VTS, sin shell | vacío |
| `VTS_LAUNCH_COMMAND` | Array JSON de ejecutable y argumentos de un launcher que regresa al abrir VTS | vacío |

### Archivos de `config/` (recarga en caliente)

Si un JSON queda inválido, se conserva la última configuración válida y se registra el error.

| Archivo | Qué define |
|---|---|
| `persona.json` | Nombre y carácter de Alba, umbrales de "tranquilidad" |
| `scenes.json` | Escenas: qué intención activa qué expresión, movimiento, props y clips |
| `rules.json` | Reglas evento → intención, con cooldown, debounce, contadores y condiciones `when.state` |
| `bindings.json` | Mapa intención → hotkeys/parámetros, **por modelo** (con entrada `default`) |
| `assets.json` | Registro de recursos por id: PNG de props (`item`) y clips PNGTuber (`clip`) |
| `commands.json` | Comandos del CLI `alba`: frase → intención |
| `schemas/` | JSON Schemas para validar y autocompletar los archivos anteriores |

Los schemas describen los campos admitidos; las reglas iniciales se explican en [`docs/demo.md`](docs/demo.md). La referencia completa de configuración queda para la fase final.

## Uso

### Comandos de terminal

```bash
alba good night    # sleep: Alba duerme y deja de reaccionar
alba ring ring     # wake: la despierta
alba lights out    # deep_sleep: pide confirmación; en VTS puede cerrarlo, en PNGTuber solo pausa
alba focus         # modo programar, con teclado
alba tea time      # modo descanso, con taza
alba oops          # reacción de error
alba cheer         # celebración
alba hello         # saludo
alba llorar        # Eyes Cry; alias: drama
alba enojo         # Angry Sign; alias: grrr
alba amor          # Heart Eyes; alias: flechazo
alba susto         # Shock Sign; alias: buu
alba sacudida      # Anim Shake; alias: gelatina
alba reset         # Remove Expressions; respeta sleep y las duraciones mínimas
alba list          # muestra todos los comandos disponibles
alba hotkeys       # nombre e ID de los hotkeys del modelo cargado (solo vtuber)
```

Los comandos funcionan igual en ambos modos: el bridge traduce la intención al clip o al hotkey que corresponda. `alba hotkeys` solo aplica a `vtuber`; en PNGTuber los clips se asignan en `config/scenes.json`.

Los nombres son tuyos: edita `config/commands.json` y listo. Sin instalación global, usa `npm run alba -- good night` o `node clients/cli/alba.mjs good night`; sustituye la frase por cualquiera de la tabla. Para tener `alba` globalmente, `npm link` requiere aprobación aparte porque modifica el entorno fuera del proyecto. Consulta [`clients/cli/README.md`](clients/cli/README.md).

El [catálogo completo y la guía para añadir comandos](docs/adding-a-command.md) explican cómo crear alias, elegir un hotkey y configurar la duración. Las escenas temporales vuelven a la actividad anterior; para que terminen en idle y limpien la expresión, comienza con `alba ring ring`. `reset` limpia expresiones; `ring ring` además cancela actividades y props y despierta a Alba.

### Dormir y despertar

| Nivel | Qué hace | Cuándo usarlo |
|---|---|---|
| `sleep` | Mantiene la pose de dormir a baja frecuencia; ignora eventos y voz; VTube Studio y bridge siguen abiertos | Quieres usar el agente sin Alba reaccionando |
| `deep_sleep` | En VTS, cierra si el control está habilitado y confirmas; en PNGTuber solo pausa. Sin control configurado, pausa y avisa | Necesitas los recursos de la PC |
| `wake` | Vuelve a `idle` desde cualquiera de los dos | — |

El control de procesos está desactivado por defecto. Para habilitarlo configura `VTS_PROCESS_CONTROL=true` y `VTS_CLOSE_COMMAND`. Los comandos son arrays JSON de ejecutable y argumentos en `.env`, sin interpretación de shell. `VTS_LAUNCH_COMMAND` es opcional: al despertar desde `deep_sleep`, lanzar VTS también exige confirmación. Sin launcher, `alba ring ring` avisa que abras VTS a mano y Alba reconecta cuando aparezca. No se aceptan rutas o URLs sueltas como comandos; una URL debe ser argumento de un launcher configurado por el usuario.

### Conectar tu agente

El proyecto incluye el cargador local `.opencode/plugins/alba.js` y `opencode.json` para el servidor MCP. Se activan al iniciar opencode desde la raíz; no hace falta instalar paquetes globales. Reinicia el bridge después de actualizar código; los JSON sí se recargan en caliente.

- **opencode:** el [plugin](clients/opencode/README.md) reenvía `tool.execute.before/after` y `session.idle` al bridge sin argumentos ni salidas privadas.
- **MCP:** el [servidor por stdio](clients/mcp/README.md) expone `avatar_status`, `avatar_say`, `avatar_scene`, `avatar_sleep` y `avatar_wake`, más `avatar_hotkey` solo en modo `vtuber`, sin dependencias nuevas. Son voluntarias: el agente solo las usa si se lo indicas. Las llamadas reales desde el agente quedan pendientes de [verificación manual](docs/integration-validation.md).
- **HTTP:** cualquier cosa que haga POST. Ejemplos en [`clients/http/examples.md`](clients/http/examples.md).

```bash
curl -X POST http://127.0.0.1:8790/intent \
  -H "Content-Type: application/json" \
  -H "X-Alba-Token: $ALBA_TOKEN" \
  -d '{"intent":"celebrate"}'
```

Endpoints: `POST /event`, `POST /intent`, `GET /state`, `GET /stream` (SSE).

## Personalizar

- **Cambiar de modelo:** carga otro en VTube Studio y añade su entrada en `config/bindings.json`. Consulta los [bindings del adapter](docs/vts-adapter.md).
- **Cambiar los clips PNGTuber:** coloca tus archivos en `assets/pngtuber/`, regístralos en `config/assets.json` y asígnalos con `clip`/`talkingClip` en `config/scenes.json`. Consulta la [guía PNGTuber](docs/pngtuber.md).
- **Agregar un comando:** añade una entrada en `config/commands.json` según su schema.
- **Agregar un prop o recurso:** coloca el PNG en `assets/props/` y registra su id en `config/assets.json`. Si falta, se omite con un aviso por causa.
- **Agregar un cliente nuevo:** traduce sus eventos al esquema canónico; el cliente HTTP compartido está en `clients/http/client.mjs`.

La [guía para añadir comandos](docs/adding-a-command.md) y la [guía PNGTuber](docs/pngtuber.md) ya están disponibles. Las demás guías completas de extensión permanecen reservadas para la fase final.

## Solución de problemas

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `doctor` no conecta con VTube Studio | Plugin API desactivada | Actívala en ⚙ → página principal → *Allow Plugin API access* |
| No aparece el popup de autorización | VTube Studio sin foco o popup oculto | Reintenta `npm run doctor` con VTube Studio en primer plano |
| Una intención no hace nada | El modelo no tiene ese hotkey | Revisa `doctor` y añade el binding de ese modelo |
| El teclado o la taza no aparecen | Falta el PNG o el permiso de items | `doctor` lista qué falta; sin ellos todo lo demás funciona |
| Alba parpadea con cada comando | Reglas sin cooldown | Sube `cooldownMs` o `debounceMs` en `rules.json` |
| VTube Studio cerrado | — | El bridge sigue vivo y registra la degradación; Alba vuelve al reabrirlo |
| La ventana PNGTuber muestra un marcador | Falta el clip o el archivo no es compatible | Revisa `npm run doctor`, el nombre en `assets.json` y el formato |
| La ventana PNGTuber no abre | Electron no está instalado o el puerto está ocupado | `npm install`, revisa `ALBA_PET_PORT` y ejecuta `npm run pet` |
| No puedo arrastrar o hacer clic en la ventana | Modo interacción desactivado | Usa `Ctrl+Alt+A` o el menú de la bandeja |

## Estructura del proyecto

```
config/     configuración JSON (+ schemas/)
src/core/   bus, director de escena, reglas, config, assets, speech
src/platform/   cerrar/lanzar VTS según el sistema operativo (configurable)
src/api/    bridge HTTP
src/adapters/   vts/ (VTube Studio), pngtuber/ (ventana Electron) y fake/
desktop/    ventana Electron, renderer y persistencia de posición
clients/    opencode/ · mcp/ · http/ · cli/
scripts/    doctor y demo
test/       pruebas
docs/       guías
assets/     modelos, PNG y clips (ignorados por git)
```

## Seguridad

- El bridge escucha **solo en 127.0.0.1**.
- Exige `Content-Type: application/json`, un token en el header `X-Alba-Token` y rechaza peticiones con `Origin` de navegador, para que ninguna página web pueda controlarlo.
- Los tokens viven únicamente en `.env`, que está ignorado por git.

## Arte y licencias

El **código** es [MIT](LICENSE). El **arte no se distribuye con este repositorio**: los modelos Live2D y las imágenes de terceros viven en `assets/`, que git ignora. Cada modelo tiene su propia licencia: respétala y anótala en [`CREDITS.md`](CREDITS.md) (autor, enlace y licencia).

## Roadmap

- **Fase 0:** núcleo, adapter de VTube Studio, doctor, integración con opencode y MCP, demo, dormir/despertar.
- **Fases 1–4:** registro de adapters, clips en assets, recarga en caliente, adapter PNGTuber, ventana Electron, diagnóstico por modo y documentación.
- **Fase 2 (voz):** TTS (edge-tts, con SAPI de Windows como respaldo) y lip-sync por amplitud de audio.
- **Más adelante:** overlay propio para props, recursos de sonido, atajo global para dormir, más clientes (Claude Code, Codex).
- **Final:** instalación con un comando, guías completas, tests y CI, paquete de avatar compartible.

## Contribuir

Aún no hay guía de contribución; llegará antes de la publicación. Mientras tanto, si encuentras un problema, abre un issue con la salida de `npm run doctor`.
