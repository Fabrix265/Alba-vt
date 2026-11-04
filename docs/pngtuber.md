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

## Activar el modo

En `.env`:

```dotenv
ALBA_ADAPTER=pngtuber
ALBA_PET_PORT=8791
ALBA_PET_LAUNCH=true
ALBA_PET_TOKEN=
```

`ALBA_PET_TOKEN` es opcional: si está vacío se usa `ALBA_TOKEN`. El WebSocket
escucha solo en `127.0.0.1`. El alias antiguo `pet` equivale a `pngtuber`.

Arranca el bridge:

```bash
npm start
```

Con `ALBA_PET_LAUNCH=true` el bridge abre la ventana automáticamente. Para abrirla
por separado, con el bridge ya activo:

```bash
npm run pet
```

Si la ventana no encuentra el bridge, reintenta la conexión cada 1,5 s. Al
cerrarla se cierra también el proceso de Electron; el bridge continúa vivo.

## Clips

Coloca los archivos en `assets/pngtuber/` y regístralos por id en
`config/assets.json`:

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

Formatos admitidos: PNG, GIF, APNG y WebP como imagen; WebM y MP4 como video.
Cada clip puede pesar hasta 30 MiB. `fit` acepta `contain` (por defecto),
`cover` o `stretch`; `loop` es `true` salvo que se indique `false`.

Después asigna el clip a cada escena en `config/scenes.json`:

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
existe, se mantiene el clip normal. La búsqueda degrada en este orden: clip de
habla, clip de la escena, `idle`, y finalmente un marcador. Un clip ausente no
rompe el bridge: se registra un aviso por causa y la ventana sigue funcionando.

Los nombres de `config/assets.json` son solo un ejemplo. Cambia los archivos y
las rutas por los tuyos. `assets/pngtuber/` está ignorado por git salvo su
README y `.gitkeep`.

## La ventana

- Es transparente, sin marco, siempre encima y no aparece en la barra de tareas.
- Por defecto no captura el ratón. Al pasar sobre la figura se vuelve
  interactiva para poder arrastrarla; al salir vuelve a ser transparente a los
  clics.
- `Ctrl+Alt+A` alterna el modo interacción. También se puede activar desde el
  icono de la bandeja.
- Arrastra con el botón izquierdo para moverla. La posición se guarda en los
  datos de usuario de Electron y se restaura si sigue dentro de una pantalla.
- El menú de la bandeja permite mostrar a Alba, reconectar o salir.

## Protocolo local

La ventana se conecta a `ws://127.0.0.1:<ALBA_PET_PORT>/?token=<token>`. El hub
responde con:

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

El cliente puede enviar `{"type":"ping"}` y recibe `{"type":"pong"}`. El estado
se envía también a quien se conecte tarde, así que abrir la ventana después del
bridge no pierde la escena actual.

## Diagnóstico

```bash
npm run doctor
```

En este modo `doctor` no intenta conectarse a VTube Studio. Comprueba el adapter,
`ALBA_TOKEN`/`ALBA_PET_TOKEN`, `ALBA_PET_PORT`, la disponibilidad de Electron y
los clips declarados. Los clips ausentes y Electron sin descargar son avisos, no
errores: la ventana puede abrirse y mostrar el marcador.

Para una prueba sin ventana ni conexiones usa `ALBA_ADAPTER=fake` o
`npm run demo -- --fake`.

## Problemas frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| La ventana no abre | Electron no instalado | `npm install` y `npm run pet` |
| La ventana no abre | Puerto ocupado | Cambia `ALBA_PET_PORT` y reinicia el bridge |
| Se ve el marcador | Falta el clip o el formato no es válido | Revisa `doctor` y `assets.json` |
| No conecta | Token distinto o bridge apagado | Iguala `ALBA_PET_TOKEN`/`ALBA_TOKEN` y arranca `npm start` |
| No se puede arrastrar | Modo interacción desactivado | `Ctrl+Alt+A` o el menú de la bandeja |
