# Añadir un recurso (clips y props)

Un **recurso** es un archivo de arte que Alba muestra: un clip PNGTuber o un
prop de VTube Studio. Todos siguen las mismas reglas:

1. El archivo va **dentro de `assets/`**. Esa carpeta está ignorada por git: tu
   arte (o el de terceros) nunca se sube al repositorio. Alba rechaza rutas
   fuera de `assets/`.
2. Se registra con un **id** en `config/assets.json`.
3. Las escenas, reglas y comandos lo usan **por id**, nunca por ruta.
4. Si falta, Alba lo omite, avisa una vez y sigue funcionando.

Si el arte es de otra persona, anota autor, enlace y licencia en
[`CREDITS.md`](../CREDITS.md).

## Clips (modo PNGTuber)

```json
"coding": {
  "type": "clip",
  "file": "assets/pngtuber/coding.webm",
  "fit": "contain",
  "loop": true
}
```

| Campo | Valores | Para qué |
|---|---|---|
| `type` | `"clip"` | Obligatorio |
| `file` | ruta dentro de `assets/` | Obligatorio |
| `fit` | `contain` (por defecto), `cover`, `stretch` | `contain` respeta la proporción; `cover` llena recortando; `stretch` deforma hasta llenar |
| `loop` | `true` (por defecto) / `false` | Repetir el video. Los GIF/APNG repiten según el propio archivo |
| `description` | texto | Nota para ti |

**Formatos:** `.png`, `.gif`, `.apng`, `.webp`, `.webm`, `.mp4`. Máximo 30 MiB.
Para transparencia en video usa WebM con canal alfa (VP8/VP9).

**Consejos de exportación**

- Mismo tamaño de lienzo en todos los clips → Alba no "salta" al cambiar.
- Recorta el lienzo al personaje: la ventana captura el ratón en el rectángulo
  del clip y deja pasar los clics fuera de él.
- Para la versión "hablando", exporta la misma pose con la boca moviéndose en
  bucle y regístrala como `<escena>_talk`.
- Un PNG normal debe llamarse `.png`, no `.apng`.

Luego asígnalo a una escena con `clip` / `talkingClip` en `config/scenes.json`
(o dale al clip el mismo id que la escena). El paso a paso está en
[Crea tus propias cosas](customize.md#modo-pngtuber-un-clip).

## Props (solo VTuber)

Objetos que aparecen junto al modelo en VTube Studio (teclado, taza…).

```json
"keyboard": {
  "type": "item",
  "file": "assets/props/keyboard.png",
  "layer": "props",
  "position": { "x": 0, "y": -0.2 },
  "size": 0.3
}
```

| Campo | Valores | Para qué |
|---|---|---|
| `type` | `"item"` | Obligatorio |
| `file` | ruta dentro de `assets/` | `.png`, `.jpg` o `.gif`, menos de 5 MiB, 64–2048 px por lado |
| `position` | `x`, `y` entre -1 y 1 (y `rotation` en grados) | Dónde aparece; 0,0 es el centro |
| `size` | 0 a 1 | Tamaño relativo |
| `layer` | `"props"` | Capa aditiva; los props se suman a la escena |

Para que aparezca:

- En una escena: `"props": ["keyboard"]` (ej. `coding`).
- En un comando: `"args": { "props": ["mug"] }` (ej. `tea time`).
- VTS necesita el permiso **LoadCustomImagesAsItems**. Pídelo una vez poniendo
  `VTS_REQUEST_ITEM_PERMISSION=true` en `.env`, reinicia el bridge y acepta el
  popup. Después puedes volver a `false`.

En modo PNGTuber los props se ignoran (doctor los marca «no aplica al adapter»).

## Comprobar

```powershell
npm run doctor
```

Al final aparece cada recurso con su estado: `presente`, `no aplica al adapter`
o `no disponible (<motivo>)`: no existe el archivo, formato no admitido, pesa
demasiado o está fuera de `assets/`.
