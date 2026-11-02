# Alba-vt — Prompt de arranque para opencode

Estoy arrancando un proyecto y quiero que me ayudes a construirlo. Aquí tienes todo el contexto para que no tengas que investigar de cero ni repetirme preguntas ya respondidas. Si algo te parece inconsistente o riesgoso, dilo en vez de asumir.

---

## 1. Qué es

**Alba** es un personaje VTuber 2D (Live2D, renderizado por VTube Studio, "VTS") que me acompaña mientras trabajo con un agente de código: programar, depurar, refactorizar, estudiar.

- No es un chatbot aparte: es la **presencia visual del agente** en mi máquina.
- Hoy uso **opencode**, pero el proyecto debe funcionar igual con Claude Code, Codex, etc. El core no debe saber quién le habla.
- La uso todos los días: tiene que ser **tranquila y no molesta**.
- Debe poder **dormir** (ver §6) cuando quiera usar opencode sin ella, o apagarse del todo (deep sleep) cuando necesite los recursos de la PC.
- **Todo debe ser fácil de agregar y de cambiar**: comportamientos, comandos, props, modelos de avatar. Agregar algo nuevo = editar JSON o soltar un archivo, no tocar código.

---

## 2. Decisiones ya tomadas (no las reabras salvo que veas un problema concreto)

- Arquitectura **event-driven con ports & adapters** + un **director de escena**.
- **Plugin de opencode tonto**: solo reenvía eventos por HTTP. Toda la lógica vive en un **bridge local**, así cambio el comportamiento sin reiniciar opencode.
- Se envían **intenciones** ("coding", "error", "sleep"), no comandos de VTS. Los adapters traducen.
- Cada adapter declara **capacidades**; si falta un permiso, el director **degrada** en vez de romper.
- Configuración **toda en JSON con recarga en caliente**.
- **Layout multi-cliente desde el día 1** (confirmado): `clients/opencode`, `clients/mcp`, `clients/http`, `clients/cli`.
- Stack: **Node 24, ESM puro sin bundler, `ws` y `dotenv`**. Bridge en `127.0.0.1:8790`.
- **Modelo de avatar de Fase 0: Akari**, pero el modelo debe ser **intercambiable** (ver §7).
- TTS en **Fase 2** (edge-tts, fallback SAPI de Windows) con lip-sync por amplitud real.

---

## 3. Esquema de evento canónico (contrato del core)

Cada cliente traduce sus eventos nativos a este formato. **El core y `rules.json` solo ven eventos canónicos.**

```json
{
  "source": "opencode",
  "type": "tool.start | tool.end | session.idle | session.start | error | say | custom",
  "tool": "bash | edit | read | ...",
  "ok": true,
  "text": "solo para say",
  "meta": {}
}
```

- Las reglas de traducción de cada cliente viven en `clients/<nombre>/`.
- `rules.json` es **global** y trabaja sobre eventos canónicos y sobre el estado del director.
- Un cliente nuevo = un traductor a este esquema, nada más.

### Intenciones

Vocabulario inicial: `idle`, `thinking`, `coding`, `reading`, `celebrate`, `error`, `sad`, `angry`, `sleep`, `wake`, `deep_sleep`, `say`. Se pueden añadir intenciones nuevas desde JSON.

---

## 4. Director de escena

Cuatro capas, **no todas del mismo tipo**:

| Capa | Tipo | Ejemplo |
|---|---|---|
| `base` | exclusiva | idle, respirar |
| `activity` | exclusiva | thinking, coding |
| `transient` | exclusiva y temporal, con duración | error, celebrate, sad, angry |
| `props` | **aditiva** (no compite por prioridad) | teclado, taza |

- Prioridad entre exclusivas: `transient > activity > base`.
- Los **props conviven** con la actividad: el teclado aparece mientras codea y se retira al terminar.
- Al expirar un `transient`, se vuelve a `activity`/`base` sin parpadeos.

### Tranquila y no molesta

Las reglas deben soportar desde el inicio:
- **cooldown** por regla,
- **duración mínima** de cada estado,
- **debounce** (los eventos de herramientas llegan en ráfagas),
- **contadores por ventana de tiempo** y condiciones con estado. Ejemplo: "3 errores en 2 minutos → `sad`"; "error seguido de otro error en menos de 30 s → `angry`".
- Un **límite global** de transientes por minuto.

---

## 5. Recursos (PNG y otros) — abiertos desde el inicio

Los props y cualquier otro recurso visual o sonoro se declaran en **`config/assets.json`**, un registro abierto por id:

```json
{
  "keyboard": { "type": "item", "file": "assets/props/keyboard.png", "layer": "props", "position": {}, "size": 0.3 },
  "mug":      { "type": "item", "file": "assets/props/mug.png",      "layer": "props" }
}
```

- Escenas, reglas o comandos referencian recursos **por id** (`"props": ["keyboard"]`). Para añadir uno nuevo: soltar el archivo y agregar una entrada. Sin tocar código.
- El campo `type` es extensible (`item` ahora; mañana `sound`, `overlay`, etc.) con un cargador por tipo.
- **Si el archivo no existe o falta el permiso de items de VTS, el recurso simplemente no aparece**: se registra un aviso **una sola vez** y todo lo demás funciona.
- El doctor lista qué recursos están presentes y cuáles faltan.
- Los PNG de terceros van fuera del repo (ver reglas §10). Puede haber un placeholder genérico propio si lo necesito.

---

## 6. Dormir y despertar

Dos niveles, controlados por intenciones (cualquier cliente puede dispararlas):

- **`sleep`**: Alba hace la escena de dormir, **deja de reaccionar** y de inyectar parámetros; los eventos se ignoran. VTS y el bridge siguen abiertos. Sirve para usar opencode con normalidad.
- **`deep_sleep`**: además **cierra VTS** para liberar recursos. El bridge sigue vivo para recibir `wake`.
  - Cerrar un proceso fuera del proyecto exige **mi confirmación explícita** cada vez (prompt `y/N`, con `--yes` opcional solo si lo pongo yo).
  - Para despertar desde deep sleep hay que reabrir VTS: el comando de lanzamiento es **configurable** (p. ej. `steam://rungameid/<appid>`, que debes verificar, o la ruta del exe). Si no está configurado, `wake` me avisa que abra VTS a mano y reconecta solo cuando aparezca.
- **`wake`** vuelve a `base/idle` desde cualquiera de los dos.

---

## 7. Modelos de avatar intercambiables

- `config/bindings.json` es **por modelo**, con una entrada `default`. Mapea intenciones → hotkeys/parámetros del modelo.
- Si el modelo no tiene un hotkey para una intención, se usa el **respaldo por parámetros estándar** (ángulo de cabeza, cejas, ojos, sonrisa) y, si tampoco hay, se degrada a `idle` y se registra.
- El modelo activo se detecta por VTS (`CurrentModelRequest`) y se elige su binding por nombre/id.
- Los modelos de muestra de VTS (akari, hijiki, hiyori, tororo, wanko) probablemente traen **pocas expresiones**: el doctor debe mostrar qué hotkeys reales hay para que arme los bindings a partir de eso.
- Parámetro de boca: **no asumas el nombre**. Verifícalo con `InputParameterListRequest` y haz que sea configurable en `bindings.json`.

---

## 8. Comandos de terminal con nombres libres

Ejecutable corto **`alba`** con una tabla editable en **`config/commands.json`** (frase → intención + argumentos). Recarga en caliente.

Uso: `alba <frase>`, por ejemplo `alba good night`.

Defaults creativos (yo los renombraré fácilmente):

| Comando | Intención |
|---|---|
| `alba good night` | `sleep` |
| `alba ring ring` | `wake` |
| `alba lights out` | `deep_sleep` (pide confirmación) |
| `alba hello` | saludo (`celebrate` suave) |
| `alba focus` | `coding` + props de teclado |
| `alba tea time` | `base` + prop de taza |
| `alba oops` | `error` |
| `alba cheer` | `celebrate` |

- Se instala con `npm link` o equivalente (**pídeme aprobación antes**, está fuera del proyecto).
- Todas las vías (CLI, MCP, HTTP, opencode) disparan las mismas intenciones por el mismo camino.
- `alba list` muestra los comandos disponibles.

---

## 9. Bridge: seguridad local

- Escucha **solo en 127.0.0.1:8790**.
- Cualquier página web puede hacer POST a localhost, así que además: exigir `Content-Type: application/json`, un **token en el header** (`X-Alba-Token`, definido en `.env`) y rechazar peticiones con `Origin` de navegador.
- Endpoints: `POST /event`, `POST /intent`, `GET /state`, `GET /stream` (SSE).
- **Recarga en caliente segura**: si un JSON queda inválido se conserva la última config válida y se loguea el error.
- Con VTS cerrado o sin permisos, el bridge sigue vivo y **loguea la degradación**.

---

## 10. Reglas del proyecto

- Modelos Live2D, PNG y todo arte de terceros van **fuera del repo**: `assets/` en `.gitignore`. El motor es público (MIT); el arte no se distribuye.
- `CREDITS.md` con autor, link y licencia de cada modelo/recurso usado.
- Secretos solo en `.env` (ignorado por git, con `.env.example`). Nunca tokens en el repo.
- Antes de **instalar o modificar algo fuera de la carpeta del proyecto**, pídeme aprobación.
- Las tools MCP son **voluntarias** (el agente solo las llama si se lo indico, p. ej. en mi `AGENTS.md`); los eventos del plugin son automáticos.

### Portabilidad y testabilidad (desde el día 1, para poder publicarlo luego)

- **Cero supuestos de mi PC en el código**: rutas, puertos, comandos de lanzamiento y cierre de VTS, todo en `config/` o `.env`. Nada hardcodeado de Windows, Steam o mi usuario.
- **Esquemas JSON desde el Paso 2**, no al final: cada archivo de `config/` se valida contra su schema y lleva `$schema` para tener autocompletado en el editor.
- **El core se prueba sin VTS** gracias al adapter `fake`, que sirve igual para la demo, los tests y una CI futura.
- Lo específico de un sistema operativo (cerrar o lanzar VTS) queda aislado en `src/platform/vts-process.mjs`, detrás de una interfaz y desactivable.
- La voz pasa por `src/core/speech.mjs` con la interfaz `speak({text, audio?})`: en Fase 0 genera lip-sync sintético y en Fase 2 recibirá audio real.

---

## 11. Estado de mi máquina (verificado, no lo repitas)

- Windows 11. VTube Studio **ya instalado** en `C:\Program Files (x86)\Steam\steamapps\common\VTube Studio`, con modelos importados: akari, hijiki, hiyori, tororo, wanko (cada uno con su `.vtube.json`). Último cargado: akari. No hay que descargar modelos.
- Puerto 8001 **cerrado**: todavía no habilité la Plugin API. Lo hago yo en VTS: ⚙ → página principal de configuración → "Allow Plugin API access".
- Aún no hay token de plugin. En el primer connect VTS muestra un popup para aprobar; el token va al `.env`, nunca al repo.
- git 2.53.0, Node v24.14.1, npm 11.11.0, Python 3.11.9.
- Navegador: Opera GX.

---

## 12. Plan de Fase 0 (estimado: **5–8 h repartidas en sesiones**)

**Paso 0 — Verificación previa.** Comprueba si el puerto 8001 responde (puedes ejecutarlo tú). Si no, dime exactamente qué hacer y espera a que lo confirme.

**Paso 1 — Scaffold.** La estructura de carpetas ya la crea otro prompt (`alba-vt-scaffold-prompt.md`): verifica que existe tal cual. Crea `package.json` (ESM, `ws`, `dotenv`, scripts `doctor`, `demo`, `start`, `test`), `.gitignore` (ignora `.env` y el contenido de `assets/`, conservando los `.gitkeep`), `bin: { "alba": "clients/cli/alba.mjs" }` en `package.json`, `.env.example` con `VTS_PORT=8001`, `VTS_AUTH_TOKEN=`, `ALBA_BRIDGE_PORT=8790`, `ALBA_TOKEN=` y `VTS_LAUNCH_COMMAND=`, `LICENSE` MIT, `CREDITS.md`, `git init` y primer commit. `README.md` y `AGENTS.md` los pego yo en la raíz: no los sobrescribas, y si algo de ellos contradice lo que construyes, avísame.

**Paso 2 — Core.** Bus de eventos, esquema canónico, cargador de config con validación y watch (conserva la última válida), **JSON Schemas en `config/schemas/`** con mensajes de error claros, director de 4 capas (props aditivos), registro de capacidades, registro de assets, un **adapter `fake`** (`src/adapters/fake/`) que registra lo que haría sin necesitar VTS, y `api/server.mjs` con los 4 endpoints y seguridad de §9. Añade tests de los módulos puros (director, reglas, validación, traducción de eventos) que corran con el adapter `fake`.

**Paso 3 — Adapter VTS.** WebSocket, `AuthenticationTokenRequest` guardando el token en `.env`, reconexión con backoff, `HotkeysInCurrentModelRequest`, `HotkeyTriggerRequest`, `InjectParameterDataRequest`, `InputParameterListRequest`, carga de Items (`ItemLoadRequest`) y detección de permisos disponibles.

**Paso 4 — Doctor.** `scripts/doctor.mjs`: Node, VTS en 8001, autenticación, modelo cargado, hotkeys reales, parámetros de entrada, permisos, assets presentes/faltantes. Salida legible.

**Paso 5 — Integración y comandos.**
- Plugin de opencode que reenvía `tool.execute.before/after` y `session.idle` traducidos al esquema canónico.
- MCP local con tools `avatar_status`, `avatar_say`, `avatar_scene`, `avatar_hotkey`, `avatar_sleep`, `avatar_wake`.
- CLI `alba` con `commands.json` (§8).
- Ejemplo curl en `clients/http`.

**Paso 6 — Demo.** 5 reglas base en `rules.json` (incluye cooldown/debounce y al menos un contador) y un script que emite eventos falsos para ver a Alba reaccionar sin opencode.

**Lip-sync en Fase 0:** **sintético** (la boca se mueve según el largo del texto, sin audio). La interfaz `speak({text, audio?})` ya debe aceptar audio para que en Fase 2 el lip-sync real por amplitud se enchufe sin cambiar nada más.

---

## 13. Fase 0 está terminada cuando

- `npm run doctor` muestra VTS conectado, token guardado y modelo detectado, y lista assets presentes/faltantes.
- `npm run demo` hace que Alba pase idle → thinking → coding → celebrate → idle.
- Desde opencode, `avatar_say` mueve la boca (sintético), un comando dispara `coding` y un error dispara `error`.
- `alba good night` la duerme y `alba ring ring` la despierta; `alba lights out` pide confirmación.
- Con los PNG presentes aparece el teclado al codear; **sin ellos todo funciona igual** y se loguea un solo aviso.
- Con VTS cerrado el bridge sigue vivo y loguea la degradación.
- Reiniciar opencode no rompe nada.
- Cambiar de modelo (p. ej. Akari → Hiyori) solo requiere añadir su entrada en `bindings.json`.
- `npm test` pasa usando el adapter `fake`, sin VTS abierto.
- Todos los JSON de `config/` se validan contra sus schemas y un JSON inválido conserva la última config válida.

---

## 14. Fase final — que otros puedan usarlo (último paso)

**No empieces esta fase antes de cerrar Fase 0 y de que yo lo apruebe.** Objetivo: que alguien en otra máquina, sin mi ayuda, lo instale y vea a Alba reaccionar siguiendo solo el README.

- **Instalación:** un comando para arrancar (`npx alba init` crea `config/`, `.env` y el token). Plugin de opencode y MCP publicables como paquetes instalables.
- **Portabilidad:** quitar los supuestos de Windows/Steam. `deep_sleep` y el lanzamiento de VTS configurables; comportamiento definido y documentado en macOS y Linux (VTS existe en macOS), o `deep_sleep` desactivado donde no aplique.
- **Documentación:** README con GIF o capturas, `docs/` completo (primeros pasos, referencia de cada JSON, cómo agregar modelo, comando, recurso y cliente) y mensajes de `doctor` que expliquen cada fallo con el paso exacto para arreglarlo.
- **Legal y arte:** `CREDITS.md` completo, qué modelos son gratuitos y de dónde se descargan con su licencia, PNG propios o CC0 si se distribuye alguno, y aviso de proyecto no oficial (sin relación con VTube Studio, Live2D ni opencode).
- **Calidad:** tests, mock de VTS para CI, CI en GitHub (lint y tests), versionado semántico y `CHANGELOG.md`.
- **Comunidad:** `CONTRIBUTING.md`, plantillas de issues, código de conducta y un formato de "paquete de avatar" (bindings + assets.json + créditos) compartible sin incluir arte con copyright.
- **Seguridad:** auditar el historial de git por tokens o rutas personales antes de hacerlo público; documentar el modelo de amenazas (solo loopback, token en header).

**Terminado cuando:** un usuario nuevo, solo con el README, instala, ve `doctor` en verde y a Alba reaccionando en menos de 30 minutos.

---

## 15. Fuera de Fase 0 (backlog)

TTS real y lip-sync por amplitud (Fase 2), overlay propio para props sin permiso de items, atajo de teclado global, recursos de tipo `sound`, otros modelos y clientes (Claude Code, Codex).

---

## 16. Cómo quiero que trabajes

1. Empieza por el **Paso 0**.
2. Avanza por los pasos **en orden**, mostrándome el resultado de cada uno antes de pasar al siguiente.
3. Pídeme aprobación antes de tocar algo fuera de la carpeta del proyecto.
4. Si algo de este contexto te parece inconsistente o falta información, **pregúntame antes de asumir**.