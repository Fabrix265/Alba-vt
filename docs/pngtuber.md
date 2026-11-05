# Modo PNGTuber

El modo PNGTuber muestra a Alba en una ventana transparente, siempre encima
del escritorio, usando clips en lugar de un modelo Live2D. No necesita VTube
Studio ni Live2D: el bridge sigue recibiendo los mismos eventos y el director
elige la escena; el adapter solo traduce esa escena a un clip.

## Requisitos

- Node.js 24 o superior.
- Electron, declarado como dependencia opcional. `npm install` lo instala; el
  binario puede descargarse la primera vez que se abre la ventana.
- Tus propios clips en `assets/pngtuber/`. El repositorio no incluye arte.

---

## Puesta en marcha paso a paso

### 1. Activa el modo en `.env`

Añade estas líneas al archivo `.env` de la raíz (si `ALBA_ADAPTER` no
existía, agrégala; el valor por defecto es `vtuber`):

```dotenv
ALBA_ADAPTER=pngtuber

# Opcionales: estos son exactamente los valores por defecto
ALBA_PET_PORT=8791
ALBA_PET_LAUNCH=true
ALBA_PET_TOKEN=
```

- `ALBA_ADAPTER=pngtuber` es lo **único obligatorio**. Sin esa línea el
  proyecto arranca en modo VTuber e intenta conectar con VTube Studio.
- `ALBA_PET_PORT` es el puerto del WebSocket local de la ventana. Escucha
  solo en `127.0.0.1`.
- `ALBA_PET_LAUNCH=true` hace que el bridge abra la ventana solo. Si pones
  `false`, la abres a mano con `npm run pet`.
- `ALBA_PET_TOKEN` vacío significa «usa el mismo `ALBA_TOKEN` del bridge»;
  no hace falta repetir el token.
- El alias histórico `pet` equivale a `pngtuber` en `ALBA_ADAPTER`.
- Los JSON de `config/` se recargan solos, pero `.env` solo se lee al
  arrancar: **reinicia el bridge** después de cambiarlo.
- Tu token de VTS (`VTS_AUTH_TOKEN`) puede quedarse en `.env`; en este modo
  simplemente no se usa. Para volver a VTuber, borra la línea o escribe
  `ALBA_ADAPTER=vtuber`.

### 2. Agrega tus clips

La ventana necesita archivos tuyos; el repo solo trae un `.gitkeep` y un
README en `assets/pngtuber/`.

**Mínimo absoluto:** un solo archivo

```
assets/pngtuber/idle.apng
```

Con ese archivo ya verás a Alba en todas las escenas (siempre la misma
imagen). Sin él, la ventana muestra un marcador con el texto
«Alba PNGTuber / Agrega tus clips en assets/pngtuber».

**Para que cada reacción tenga su cara**, estos son los 11 ids ya declarados
en `config/assets.json` y ya asignados en `config/scenes.json`. Si usas
estos nombres exactos, **no tienes que tocar ningún JSON**:

> La tabla muestra los valores por defecto del repo. Lo que manda siempre es
> el campo `file` de `assets.json`: si tu `idle` apunta a `idle.gif` en vez
> de `idle.apng`, simplemente usa esa ruta y respeta la extensión.

| Escena | Archivo esperado |
|---|---|
| `idle` (también `reset`) | `assets/pngtuber/idle.apng` |
| `idle` hablando | `assets/pngtuber/idle_talk.apng` |
| `thinking` | `assets/pngtuber/thinking.apng` |
| `thinking` hablando | `assets/pngtuber/thinking_talk.apng` |
| `coding` | `assets/pngtuber/coding.apng` |
| `reading` | `assets/pngtuber/reading.apng` |
| `celebrate` | `assets/pngtuber/celebrate.apng` |
| `error` | `assets/pngtuber/error.apng` |
| `sad` | `assets/pngtuber/sad.apng` |
| `angry` | `assets/pngtuber/angry.apng` |
| `sleep` | `assets/pngtuber/sleep.apng` |

`shake`, `deep_sleep` y `wake` no tienen clip propio y usan `idle`.

**Si prefieres tus propios nombres**, cambia la ruta en `config/assets.json`:

```json
{
  "idle": {
    "type": "clip",
    "file": "assets/pngtuber/mi-personaje-descanso.png",
    "fit": "contain",
    "loop": true
  }
}
```

Si cambias el **id** (`idle`) en vez de la ruta, actualiza también `clip` y
`talkingClip` en `config/scenes.json`. La extensión del archivo debe ser una
de las admitidas.

**Orden en que se busca el clip:** el de hablar (`talkingClip`), el de la
escena (`clip`), luego `idle`, y si falta todo, el marcador. Por eso basta
con `idle` para arrancar y el resto es opcional.

**Formatos y límites:**

- Imagen: `.png`, `.gif`, `.apng`, `.webp`. Video: `.webm`, `.mp4`.
- Máximo 30 MiB por archivo.
- `fit`: `contain` (por defecto, respeta proporción), `cover` (llena el
  espacio recortando) o `stretch` (deforma hasta llenar).
- `loop`: `true` salvo que escribas `false`.
- Un clip ausente o inválido nunca rompe el bridge: se avisa una vez por
  causa y la ventana sigue funcionando.

Si tu archivo es un PNG normal, nombralo `idle.png` y pon
`"file": "assets/pngtuber/idle.png"` en `assets.json`; no lo renombres a
`.apng` a menos que realmente sea APNG.

### 3. Levanta el bridge

```bash
npm install     # una vez; instala Electron como dependencia opcional
npm start       # arranca el bridge y abre la ventana PNGTuber
```

En una segunda terminal:

```bash
npm run demo    # idle → thinking → coding → celebrate → idle
```

Otras formas de abrir la ventana:

```bash
npm run pet                 # solo la ventana (el bridge debe estar activo)
npm run alba -- hello       # un saludo: la ventana pasa a celebrate
```

Si la ventana no encuentra el bridge, reintenta la conexión cada 1,5 s. Al
cerrarla se cierra también el proceso de Electron; el bridge continúa vivo.

### 4. Comprueba que se ve a Alba

Qué esperas ver en pantalla:

- Una ventana **transparente, sin marco, siempre encima**, de 420×560, que
  no aparece en la barra de tareas pero sí con un **icono en la bandeja**.
- Tu clip animado (o el marcador si aún no hay archivos).
- Un **punto de estado** en la esquina superior derecha: rojo sin conexión
  y verde cuando está conectada al bridge.
- Si todavía no hay clip o no hay conexión, la ventana **nunca queda
  transparente/vacía**: muestra el marcador con el motivo («Conectando con
  el bridge…» o «Agrega tus clips en assets/pngtuber»).
- Un **globo de diálogo** con el texto cuando alguien usa `avatar_say`.

Chequeos rápidos:

```bash
npm run doctor          # en este modo NO toca VTube Studio
npm run demo            # en otra terminal: la ventana cambia de clip
npm run alba -- hello   # celebrate
npm run alba -- good night   # sleep: se queda dormida
npm run alba -- ring ring    # vuelve a idle
```

`doctor` revisa el adapter, el token, el puerto, Electron y cuántos de los
clips declarados existen. Los clips ausentes son **avisos**, no errores.

Para ver el estado crudo del bridge:

```bash
curl -H "X-Alba-Token: <tu ALBA_TOKEN>" http://127.0.0.1:8790/state
```

Ahí debe aparecer `"name": "pngtuber"`, `"desktop": true` (la ventana está
abierta) y `"clients": 1` (la ventana está conectada).

### 5. Interacción y reacciones

- `Ctrl+Alt+A` alterna el modo interacción (también desde el icono de la
  bandeja). Por defecto la ventana **no captura el ratón**: pasas el cursor
  encima para volverla interactiva.
- Arrastra con el botón izquierdo para moverla; la posición se guarda y se
  restaura si sigue dentro de una pantalla.
- El menú de la bandeja permite mostrar a Alba, reconectar o salir.
- Los clientes de siempre (plugin de opencode, MCP, HTTP, CLI) funcionan
  igual: llegan eventos, el director cambia de escena y la ventana cambia de
  clip.
- **No hay hotkeys en este modo.** `alba hotkeys` lo explica, y el servidor
  MCP no anuncia `avatar_hotkey` cuando el adapter no soporta hotkeys.
- `lights out` (`deep_sleep`) en PNGTuber solo pausa a Alba: la ventana
  sigue abierta. Cerrar procesos no aplica aquí.

---

## Referencia

### Variables de entorno

| Variable | Para qué sirve | Por defecto |
|---|---|---|
| `ALBA_ADAPTER` | Modo: `vtuber`, `pngtuber` o `fake` (alias `vts` y `pet`) | `vtuber` |
| `ALBA_PET_PORT` | Puerto WebSocket local de la ventana | `8791` |
| `ALBA_PET_LAUNCH` | Abrir la ventana al arrancar el bridge | `true` |
| `ALBA_PET_TOKEN` | Token de la ventana; vacío = `ALBA_TOKEN` | vacío |
| `ALBA_TOKEN` | Token del bridge HTTP (obligatorio para todo) | — |
| `ALBA_BRIDGE_PORT` | Puerto del bridge | `8790` |

### Configuración de clips

`config/assets.json` registra cada archivo por id:

```json
{
  "idle": {
    "type": "clip",
    "file": "assets/pngtuber/idle.apng",
    "fit": "contain",
    "loop": true
  },
  "idle_talk": {
    "type": "clip",
    "file": "assets/pngtuber/idle_talk.apng",
    "fit": "contain",
    "loop": true
  }
}
```

`config/scenes.json` asigna el clip a cada escena:

```json
{
  "idle": {
    "layer": "base",
    "clip": "idle",
    "talkingClip": "idle_talk"
  },
  "coding": {
    "layer": "activity",
    "clip": "coding"
  }
}
```

`talkingClip` se usa mientras el lip-sync sintético marca boca abierta; si no
existe, se mantiene el clip normal.

`assets/pngtuber/` está ignorado por git salvo su README y `.gitkeep`.

### La ventana

- Transparente, sin marco, siempre encima, fuera de la barra de tareas.
- Por defecto no captura el ratón; al pasar sobre la figura se vuelve
  interactiva para poder arrastrarla.
- `Ctrl+Alt+A` alterna el modo interacción; también desde la bandeja.
- Arrastra con el botón izquierdo para moverla. La posición se guarda en los
  datos de usuario de Electron y se restaura si sigue dentro de una pantalla.
- El menú de la bandeja permite mostrar a Alba, reconectar o salir.

### Protocolo local

La ventana se conecta a `ws://127.0.0.1:<ALBA_PET_PORT>/?token=<token>`. El
hub responde con:

```json
{ "type": "hello", "version": 1, "mode": "pngtuber", "port": 8791 }
```

y después retransmite cada cambio de escena:

```json
{
  "type": "state",
  "version": 1,
  "scene": "coding",
  "effective": "coding",
  "asleep": false,
  "deepSleep": false,
  "talking": false,
  "clip": {
    "id": "coding",
    "file": "assets/pngtuber/coding.apng",
    "kind": "image",
    "loop": true,
    "fit": "contain"
  }
}
```

El cliente puede enviar `{"type":"ping"}` y recibe `{"type":"pong"}`. El
estado se envía también a quien se conecte tarde, así que abrir la ventana
después del bridge no pierde la escena actual.

### Diagnóstico

```bash
npm run doctor
```

En este modo `doctor` no intenta conectarse a VTube Studio. Comprueba el
adapter, `ALBA_TOKEN`/`ALBA_PET_TOKEN`, `ALBA_PET_PORT`, la disponibilidad
de Electron y los clips declarados. Los clips ausentes y Electron sin
descargar son avisos, no errores: la ventana puede abrirse y mostrar el
marcador.

Para una prueba sin ventana ni conexiones usa `ALBA_ADAPTER=fake` o
`npm run demo -- --fake`.

### Problemas frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| Arranca en VTuber en vez de la ventana | Falta `ALBA_ADAPTER=pngtuber` en `.env` | Agrégala y reinicia el bridge |
| La ventana no abre | Electron no instalado | `npm install` y `npm run pet` |
| La ventana no abre | Puerto ocupado | Cambia `ALBA_PET_PORT` y reinicia el bridge |
| Se ve «Conectando con el bridge… (npm start)» | El bridge no está levantado | Abre otra terminal y `npm start`; déjalo corriendo |
| Se ve el marcador «Agrega tus clips…» | Faltan los archivos de clip | Pon al menos `assets/pngtuber/idle.apng` (o el que declares en `assets.json`) |
| La ventana abre pero no muestra tu GIF | `assets.json` apunta a otro nombre/extensión | Revisa el campo `file` de ese id y `npm run doctor` |
| Un estado muestra siempre la misma imagen | Solo existe `idle` | Agrega el clip de esa escena en la tabla de arriba |
| El clip no cambia con la demo | La ventana está en otro bridge/puerto | Revisa `clients: 1` en `/state` y `ALBA_PET_PORT` |
| No conecta | Token distinto o bridge apagado | Iguala `ALBA_PET_TOKEN`/`ALBA_TOKEN` y arranca `npm start` |
| El punto de estado no se pone verde | La ventana perdió la conexión | Espera 1,5 s (reintenta sola) o usa «reconectar» en la bandeja |
| No se puede arrastrar | Modo interacción desactivado | `Ctrl+Alt+A` o el menú de la bandeja |
