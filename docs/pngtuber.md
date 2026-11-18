# Modo PNGTuber

El modo PNGTuber muestra a Alba en una ventana transparente, siempre encima
del escritorio, usando clips en lugar de un modelo Live2D. No necesita VTube
Studio ni Live2D: el bridge sigue recibiendo los mismos eventos y el director
elige la escena; el adapter solo traduce esa escena a un clip.

¿Quieres crear expresiones nuevas? Sigue [Crea tus propias cosas](customize.md).
¿Quieres comprobarlo todo? Sigue [Cómo probar Alba](testing.md#3a-modo-pngtuber).

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
# Tamaño fijo de la ventana, en ancho x alto (vacío = automático)
ALBA_PET_WINDOW=
```

- `ALBA_ADAPTER=pngtuber` es lo **único obligatorio**. Sin esa línea el
  proyecto arranca en modo VTuber e intenta conectar con VTube Studio.
- `ALBA_PET_PORT` es el puerto del WebSocket local de la ventana. Escucha
  solo en `127.0.0.1`.
- `ALBA_PET_LAUNCH=true` hace que el bridge abra la ventana solo. Si pones
  `false`, la abres a mano con `npm run pet`.
- `ALBA_PET_TOKEN` vacío significa «usa el mismo `ALBA_TOKEN` del bridge»;
  no hace falta repetir el token.
- `ALBA_PET_WINDOW` vacío es el recomendado: la ventana se ajusta al tamaño
  real de tu primer clip y después recuerda el tamaño que elijas arrastrando
  el borde. Si escribes un valor como `240x240`, ese tamaño manda siempre.
- El alias histórico `pet` equivale a `pngtuber` en `ALBA_ADAPTER`.
- Los JSON de `config/` se recargan solos, pero `.env` solo se lee al
  arrancar: **reinicia el bridge** después de cambiarlo.
- Tu token de VTS (`VTS_AUTH_TOKEN`) puede quedarse en `.env`; en este modo
  simplemente no se usa. Para volver a VTuber, borra la línea o escribe
  `ALBA_ADAPTER=vtuber`.

### 2. Agrega tus clips

La ventana necesita archivos tuyos; el repo solo trae un `.gitkeep` y un
README en `assets/pngtuber/`.

**Mínimo absoluto:** un solo archivo, `assets/pngtuber/idle` con cualquier
extensión admitida (`idle.gif`, `idle.png`, `idle.webm`…).

Con ese archivo ya verás a Alba en todas las escenas (siempre la misma
imagen). Sin él, la ventana muestra un marcador con el texto
«Alba PNGTuber / Agrega tus clips en assets/pngtuber».

**Para que cada reacción tenga su cara**, nombra cada archivo como su escena y
déjalo en `assets/pngtuber/`. **La extensión da igual** mientras sea una
admitida: aunque `assets.json` diga `thinking.apng`, Alba encuentra
`thinking.gif`, `thinking.png` o `thinking.webm`. No hace falta tocar ningún
JSON.

| Archivo (cualquier extensión) | Escena | Cuándo aparece solo | Para verlo a mano |
|---|---|---|---|
| `idle` | `idle` | En reposo, cuando opencode espera tu mensaje | `npm run alba -- ring ring` |
| `idle_talk` | `answering` y `idle` hablando | **Mientras opencode escribe su respuesta**, y con `avatar_say` | Pídele algo a opencode |
| `thinking` | `thinking` | Cuando opencode recibe tu mensaje y entre paso y paso | `npm run alba -- pensar` |
| `thinking_talk` | `thinking` hablando | Mientras habla estando pensando | `pensar` y luego un `say` |
| `coding` | `coding` | Cuando el agente usa `bash`, `edit`, `write`, `patch` | `npm run alba -- focus` |
| `reading` | `reading` | Cuando el agente usa `read`, `grep`, `glob`, `list`, `search` | `npm run alba -- leer` |
| `celebrate` | `celebrate` (3 s) | Cuando opencode termina su trabajo; luego vuelve a `idle` | `npm run alba -- hello` |
| `error` | `error` (2,5 s) | Al primer error | `npm run alba -- oops` |
| `angry` | `angry` (2,5 s) | 2 errores en 30 s | `npm run alba -- enojo` |
| `sad` | `sad` (4 s) | 3 errores en 2 minutos | `npm run alba -- llorar` |
| `sleep` | `sleep` | Cuando la duermes | `npm run alba -- good night` |

`shake`, `reset`, `deep_sleep` y `wake` no tienen clip propio y usan `idle`.
`celebrate` ya no se usa al terminar opencode: aparece con `alba hello`. Las
escenas cortas (`celebrate`, `error`, `angry`, `sad`) vuelven solas a lo que
Alba hacía antes. Si una escena no tiene su archivo, se ve `idle`.

**Ver en vivo qué dispara qué:** pon `ALBA_LOG_EVENTS=true` en `.env` y reinicia
`npm start`. La terminal del bridge mostrará una línea por evento:

```
[alba] opencode tool.start (read) -> regla herramienta-lectura -> escena reading
[alba] opencode tool.start (todowrite) -> sin regla (no cambia nada)
[alba] opencode response.start -> regla respondiendo -> escena answering
[alba] opencode say -> dice "Listo, creé el archivo prueba.txt."
[alba] opencode session.idle -> regla sesion-idle -> idle cuando termine de hablar
[alba] comando "hello" -> escena celebrate
```

Así ves qué regla eligió cada clip, y qué herramientas no tienen regla todavía
(puedes añadirlas siguiendo [Crea tus propias cosas](customize.md#paso-4-que-reaccione-sola-opcional)).
`npm run alba -- status` muestra además el último evento de cada agente.

Para probar la versión «hablando», envía un `say` con
[HTTP](../clients/http/examples.md) o pídele al agente que use `avatar_say`.

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
`talkingClip` en `config/scenes.json`. Si el archivo de `file` no existe, Alba
busca el mismo nombre con otra extensión admitida; si hay varios, prefiere en
este orden: `.png`, `.gif`, `.apng`, `.webp`, `.webm`, `.mp4`.

**Orden en que se busca el clip:** el de hablar (`talkingClip`), el de la
escena (`clip`), luego `idle`, y si falta todo, el marcador. Por eso basta
con `idle` para arrancar y el resto es opcional.

**Formatos y límites:**

- Imagen: `.png`, `.gif`, `.apng`, `.webp`. Video: `.webm`, `.mp4`.
- Máximo 30 MiB por archivo.
- El archivo debe estar dentro de `assets/` (normalmente `assets/pngtuber/`);
  una ruta fuera de esa carpeta se rechaza.
- `fit`: `contain` (por defecto, respeta proporción), `cover` (llena el
  espacio recortando) o `stretch` (deforma hasta llenar).
- `loop`: `true` salvo que escribas `false`.
- Un clip ausente o inválido nunca rompe el bridge: se avisa una vez por
  causa y la ventana sigue funcionando.

Si tu archivo es un PNG normal, déjalo como `.png`; no lo renombres a `.apng`
a menos que realmente sea APNG.

**Para que los cambios no sean bruscos:**

- Entre un clip y otro hay un **fundido** de 250 ms: el nuevo aparece sobre el
  anterior y la ventana nunca queda vacía mientras carga. Ajústalo con
  `ALBA_PET_TRANSITION_MS` en `.env` (`0` = corte seco; prueba `400` para algo
  más suave; máximo `2000`).
- Usa **el mismo tamaño de lienzo** y la misma posición del personaje en todos
  los clips: si cambian, Alba parece saltar aunque haya fundido.
- Haz que cada clip **empiece y termine en una pose parecida** a `idle`
  (misma postura, ojos abiertos). Así el cambio se nota en la expresión, no en
  el cuerpo.
- Si cambia **demasiado seguido**, súbele el `cooldownMs` a la regla en
  `config/rules.json` o el mínimo por escena (`minStateDurationMs`) en
  `config/persona.json`. Con `ALBA_LOG_EVENTS=true` ves qué regla la mueve.

### 3. Levanta el bridge

```bash
npm install     # una vez; instala Electron como dependencia opcional
npm start       # arranca el bridge y abre la ventana PNGTuber
```

En una segunda terminal:

```bash
npm run demo    # idle → thinking → coding → answering → idle
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

- Una ventana **transparente, sin marco, siempre encima**, que no aparece en
  la barra de tareas pero sí con un **icono en la bandeja**. Su tamaño se
  ajusta al de tu clip (420×560 solo mientras no hay ningún clip).
- Tu clip animado (o el marcador si aún no hay archivos).
- Un **punto de estado** en la esquina superior derecha: rojo sin conexión
  y verde cuando está conectada al bridge.
- Si todavía no hay clip o no hay conexión, la ventana **nunca queda
  transparente/vacía**: muestra el marcador con el motivo («Conectando con
  el bridge…» o «Agrega tus clips en assets/pngtuber»).
- Un **globo de diálogo** cuando Alba habla: sus frases propias, la respuesta
  de opencode o `avatar_say`. El texto aparece letra por letra. Elige su estilo
  con `ALBA_PET_BUBBLE` en `.env`: `terminal` (por defecto, monoespaciado con
  cursor), `comic` (contorno grueso con colita), `subtitulo` (barra abajo, no
  tapa la cara) o `tarjeta` (azul con etiqueta «Alba»). Reinicia la ventana
  para aplicarlo.

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
  bandeja). Fuera de ese modo, la ventana **solo captura el ratón sobre el
  clip**: en el resto de la ventana los clics pasan al escritorio. Recorta tus
  clips al personaje para que el área sea lo más ajustada posible.
- Arrastra con el botón izquierdo para moverla; la posición se guarda y se
  restaura si sigue dentro de una pantalla.
- **Tamaño:** en el icono de la bandeja, menú **Tamaño → Agrandar / Achicar /
  Tamaño original del clip**. En modo interacción (`Ctrl+Alt+A`) también puedes
  usar la **rueda del ratón** sobre Alba o arrastrar un borde o una esquina. El
  tamaño se guarda y se restaura al reiniciar.
- El menú de la bandeja permite mostrar a Alba, reconectar o salir.
- Solo hay una ventana a la vez: si ya está abierta, `npm run pet` no abre otra.
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
| `ALBA_PET_BUBBLE` | Estilo del globo: `terminal`, `comic`, `subtitulo` o `tarjeta` | `terminal` |
| `ALBA_PET_TRANSITION_MS` | Fundido entre clips en ms (`0` = corte seco, máx. 2000) | `250` |
| `ALBA_LOG_EVENTS` | `true` = la terminal del bridge muestra evento → regla → escena | `false` |
| `ALBA_PET_PORT` | Puerto WebSocket local de la ventana | `8791` |
| `ALBA_PET_LAUNCH` | Abrir la ventana al arrancar el bridge | `true` |
| `ALBA_PET_TOKEN` | Token de la ventana; vacío = `ALBA_TOKEN` | vacío |
| `ALBA_PET_WINDOW` | Tamaño fijo `anchoxalto` (100–4000); vacío = automático y recordado | vacío |
| `ALBA_TOKEN` | Token del bridge HTTP (obligatorio para todo) | — |
| `ALBA_BRIDGE_PORT` | Puerto del bridge | `8790` |

### Configuración de clips

`config/assets.json` registra cada archivo por id:

```json
{
  "idle": {
    "type": "clip",
    "file": "assets/pngtuber/idle.gif",
    "fit": "contain",
    "loop": true
  },
  "idle_talk": {
    "type": "clip",
    "file": "assets/pngtuber/idle_talk.gif",
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
- Fuera del modo interacción solo captura el ratón sobre el rectángulo donde
  se dibuja el clip (o sobre el marcador); ahí puedes arrastrarla. Fuera de
  ese rectángulo los clics pasan al escritorio.
- `Ctrl+Alt+A` alterna el modo interacción; también desde la bandeja.
- Arrastra con el botón izquierdo para moverla. La posición se guarda en los
  datos de usuario de Electron y se restaura si sigue dentro de una pantalla.
- Tamaño: la ventana es Alba. Si no defines `ALBA_PET_WINDOW`, el primer clip
  fija el tamaño (el natural del archivo, sin ampliar) y desde ahí se
  recuerda el que elijas. Para cambiarlo a mano, entra en modo interacción
  (`Ctrl+Alt+A`) y arrastra un borde o una esquina; el tamaño se guarda en
  `window.json`, junto a la posición.
- `ALBA_PET_WINDOW=240x240` fuerza un tamaño exacto en cada arranque y manda
  sobre el guardado. Borra el valor (o déjalo vacío) para volver a
  redimensionar a mano.
- La ventana transparente **no usa el redimensionado nativo de Windows**:
  los tiradores los dibuja la propia ventana en modo interacción.
- El menú de la bandeja permite mostrar a Alba, reconectar o salir.

### Protocolo local

La ventana se conecta a `ws://127.0.0.1:<ALBA_PET_PORT>/?token=<token>`. El
hub responde con:

```json
{ "type": "hello", "version": 1, "mode": "pngtuber", "port": 8791 }
```

y después retransmite cada cambio de escena (mensaje `state`):

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
    "file": "assets/pngtuber/coding.gif",
    "kind": "image",
    "loop": true,
    "fit": "contain"
  }
}
```

Cuando alguien usa `say` (por ejemplo `avatar_say`), el hub envía además un
mensaje puntual para el globo de diálogo, recortado a 280 caracteres:

```json
{ "type": "say", "version": 1, "text": "Hola, estoy aquí" }
```

El cliente puede enviar `{"type":"ping"}` y recibe `{"type":"pong"}`. El hub
rechaza conexiones que traen cabecera `Origin` (páginas web) y, si hay token,
las que no lo traen. El
estado se envía también a quien se conecte tarde, así que abrir la ventana
después del bridge no pierde la escena actual.

### Diagnóstico

```bash
npm run doctor
```

En este modo `doctor` no intenta conectarse a VTube Studio. Comprueba el
adapter, `ALBA_TOKEN`/`ALBA_PET_TOKEN`, `ALBA_PET_PORT`, `ALBA_PET_WINDOW`
si está definido, la disponibilidad de Electron y los clips declarados. Los
clips ausentes y Electron sin descargar son avisos, no errores: la ventana
puede abrirse y mostrar el marcador.

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
| No se puede arrastrar | El cursor está fuera del clip | Arrastra desde la figura, o activa `Ctrl+Alt+A` |
| Un margen vacío bloquea clics del escritorio | El clip tiene mucho lienzo transparente alrededor | Recorta el lienzo del clip al personaje |
| No aparece el globo de diálogo | Alba dormida, o el texto llegó vacío | `npm run alba -- ring ring` y vuelve a probar `avatar_say` |
| ¿Está conectada a opencode? | — | `npm run alba -- status`; ver [Conectar opencode](opencode.md) |
| La ventana queda enorme o diminuta | Tu clip tiene ese tamaño natural, o hay un tamaño guardado | Bandeja → **Tamaño** → Achicar o «Tamaño original del clip», o fija `ALBA_PET_WINDOW=240x240` en `.env` |
| Al mantener el clic la ventana crecía sola | Error de Electron con la escala de Windows al 125 % o más (corregido) | Actualiza; el tamaño guardado inflado se descarta al abrir |
| Un clip aparece de golpe | `ALBA_PET_TRANSITION_MS=0` | Pon `250` o más y reinicia el bridge |
| No sé qué regla puso un clip | — | `ALBA_LOG_EVENTS=true` y mira la terminal del bridge |
| `ALBA_PET_WINDOW` no hace nada | Valor inválido o bridge sin reiniciar | Usa `anchoxalto` (p. ej. `240x240`), revisa `npm run doctor` y reinicia el bridge |
| Al reiniciar vuelve al tamaño viejo | `ALBA_PET_WINDOW` sin definir y `window.json` con otro tamaño | Arrastra el borde con `Ctrl+Alt+A`; el último tamaño se guarda |
