# Crea tus propias cosas

Esta guía te lleva de la mano para que Alba haga **cosas nuevas**: una
expresión, una reacción automática o un comando. Funciona igual en los dos
modos; solo cambia **cómo se ve**:

- **VTuber** (VTube Studio): la expresión es un *hotkey* de tu modelo Live2D.
- **PNGTuber** (ventana de escritorio): la expresión es un *clip* (imagen o video).

No hace falta tocar código. Todo se hace editando archivos JSON de `config/`, y
el bridge los **recarga solo al guardar** (no hace falta reiniciarlo).

> Si un JSON queda mal escrito (una coma de más, una llave sin cerrar), Alba
> **no se rompe**: conserva la última versión buena y lo avisa en la terminal del
> bridge. Corrige el archivo, guarda y listo.

---

## La idea en 30 segundos

Alba funciona como una cadena de cuatro piezas. Cada una vive en un archivo:

```
algo pasa  ──►  regla  ──►  escena  ──►  cómo se ve
(evento o       rules.json   scenes.json   VTuber: bindings.json (hotkey del modelo)
 comando)       commands.json              PNGTuber: assets.json (clip en assets/pngtuber)
```

| Pieza | Archivo | Para qué sirve |
|---|---|---|
| **Escena** | `config/scenes.json` | Un "estado de ánimo" con nombre: `celebrate`, `sad`, `coding`… Cuánto dura y qué capa ocupa. |
| **Cómo se ve (VTuber)** | `config/bindings.json` | Qué hotkey de tu modelo dispara cada escena. |
| **Cómo se ve (PNGTuber)** | `config/assets.json` | Qué archivo de imagen/video corresponde a cada escena. |
| **Regla** | `config/rules.json` | "Cuando el agente haga X, pon la escena Y". Automático. |
| **Comando** | `config/commands.json` | "Cuando yo escriba `alba <frase>`, pon la escena Y". Manual. |

El nombre de la escena (por ejemplo `sorpresa`) es lo que une todas las piezas.

### Las tres capas de una escena

Cada escena dice en qué **capa** va (`layer`):

| Capa | Para qué | Ejemplos | ¿Termina sola? |
|---|---|---|---|
| `base` | El fondo, lo que hace Alba cuando no pasa nada | `idle`, `sleep` | No |
| `activity` | Lo que está haciendo el agente ahora | `coding`, `reading`, `thinking` | No: hasta que llegue otra |
| `transient` | Una reacción corta | `celebrate`, `error`, `sad` | **Sí**, tras `durationMs` |

Cuando una reacción `transient` termina, Alba vuelve a lo que estaba haciendo
antes. Las reacciones son la mejor forma de empezar.

---

## Ejemplo completo: la expresión «sorpresa»

Vamos a crear una reacción `sorpresa` de 3 segundos, con un comando
`alba wow` para lanzarla a mano.

### Paso 1. Crea la escena (los dos modos)

Abre `config/scenes.json` y añade esta entrada **dentro de `"scenes"`**, por
ejemplo justo después de `"angry"` (no olvides la coma entre entradas):

```json
"sorpresa": {
  "layer": "transient",
  "durationMs": 3000,
  "clip": "sorpresa",
  "description": "Ojos muy abiertos durante 3 segundos",
  "parameters": {
    "angleY": 6,
    "eyeOpen": 1,
    "eyeOpenRight": 1
  }
}
```

- `clip` solo lo usa el modo PNGTuber; `parameters` solo el modo VTuber (son el
  plan B si el modelo no tiene un hotkey para esta escena). Puedes dejar los dos
  y así la escena sirve en ambos modos.
- Si el clip tiene **el mismo nombre que la escena**, puedes omitir `clip`.

### Paso 2. Dale una cara

Elige tu modo. Puedes hacer los dos.

#### Modo VTuber: un hotkey de tu modelo

1. **Crea la expresión en VTube Studio.** Abre el modelo, ve a la sección de
   hotkeys (el icono del teclado) y crea un hotkey nuevo de tipo
   *Set/Unset Expression* con la expresión que quieras (o *Play Animation*
   para una animación). Ponle un nombre claro, por ejemplo `Sorpresa`.
   Algunos modelos ya traen expresiones listas para usar.
2. **Pide su ID.** Con el bridge arrancado (`npm start`) y VTS conectado:

   ```powershell
   npm run alba -- hotkeys
   ```

   Verás una lista `Nombre | ID`. Copia el **ID** de tu hotkey.
3. **Conéctalo a la escena.** En `config/bindings.json`, dentro de
   `models.<tu-modelo>.hotkeys`, añade la escena y el ID:

   ```json
   "models": {
     "akari": {
       "match": ["akari"],
       "hotkeys": {
         "sorpresa": "pega-aqui-el-ID",
         "sad": "f5538e98e4544444979c8035d44fa3ab"
       }
     }
   }
   ```

   También vale el **nombre** del hotkey en vez del ID (`"sorpresa": "Sorpresa"`),
   pero el ID no cambia si renombras el hotkey en VTS.

> Si tu modelo todavía no está en `bindings.json`, primero sigue
> [Añadir un modelo Live2D](adding-a-model.md).

**Ojo con las expresiones "toggle".** En VTS, *Set/Unset Expression* se queda
puesta hasta que la quitas. Al volver a `idle`, Alba ejecuta el hotkey de `idle`
(en Akari es *Remove Expressions*) para limpiarlas. Si tu modelo no tiene uno,
crea en VTS un hotkey *Remove All Expressions* y asígnalo a `"idle"` en
`bindings.json`.

#### Modo PNGTuber: un clip

1. **Prepara el archivo.** Exporta la expresión desde tu programa de dibujo o
   animación. Formatos: `.png`, `.gif`, `.apng`, `.webp` (imagen) o `.webm`,
   `.mp4` (video). Máximo 30 MiB.
   - **Recomendado:** fondo transparente (PNG/APNG/GIF/WebP, o WebM con canal
     alfa) y el mismo tamaño de lienzo en todos tus clips, para que Alba no
     "salte" al cambiar de expresión.
   - **Recorta** el lienzo al contorno del personaje: la ventana captura el
     ratón en todo el rectángulo del clip, así que un margen vacío enorme
     bloquea clics en el escritorio.
2. **Guárdalo** en `assets/pngtuber/`, por ejemplo `assets/pngtuber/sorpresa.png`.
   Todo el arte debe estar dentro de `assets/` (git lo ignora; nunca se sube).
3. **Regístralo** en `config/assets.json` con un id:

   ```json
   "sorpresa": {
     "type": "clip",
     "file": "assets/pngtuber/sorpresa.png",
     "fit": "contain",
     "loop": true
   }
   ```

4. **Opcional: versión "hablando".** Si quieres que mueva la boca cuando habla
   en esta escena, crea `sorpresa_talk.png`, regístralo igual con el id
   `sorpresa_talk` y añade `"talkingClip": "sorpresa_talk"` a la escena.

Si falta el clip, Alba usa `idle`, y si también falta `idle`, la ventana muestra
un marcador. Nunca se rompe.

### Paso 3. Un comando para lanzarla a mano

En `config/commands.json`, dentro de `"commands"`:

```json
"wow": {
  "intent": "sorpresa",
  "description": "Alba se sorprende"
}
```

Guarda y prueba:

```powershell
npm run alba -- wow
```

Detalles y alias en [Añadir y personalizar comandos](adding-a-command.md).

### Paso 4. Que reaccione sola (opcional)

En `config/rules.json`, dentro de `"rules"`, añade una regla. Esta pone cara de
sorpresa cuando el agente usa la herramienta `webfetch` (buscar en internet):

```json
{
  "id": "sorpresa-web",
  "when": { "type": "tool.start", "tool": "webfetch" },
  "intent": "sorpresa",
  "cooldownMs": 20000
}
```

- `cooldownMs`: espera mínima entre dos disparos de la misma regla. Súbelo si
  Alba reacciona demasiado.
- `debounceMs`: ignora eventos repetidos muy seguidos.
- `priority`: si varias reglas coinciden con el mismo evento, gana la de número
  más alto (por defecto 0).
- `window`: solo dispara tras N eventos en un tiempo. Ej.: `"window": {"count": 3,
  "ms": 60000}` = "tres veces en un minuto".

Qué eventos manda opencode y qué herramientas existen: mira
[Conectar opencode](opencode.md#qué-eventos-envía-opencode). Todos los campos de
`when` están en la [referencia de configuración](config-reference.md#rulesjson).

### Paso 5. Comprueba

```powershell
npm run doctor        # valida los JSON y te dice qué clip o hotkey falta
npm run alba -- wow   # la ves sorprendida 3 segundos
```

Si no pasa nada, mira la terminal del bridge: cada problema se avisa una vez
con su causa (escena sin clip, hotkey inexistente, JSON inválido…).

---

## Más recetas

### Cambiar el aspecto de una reacción que ya existe

No hace falta crear escenas nuevas:

- **VTuber:** cambia el ID de `bindings.json` → `models.<modelo>.hotkeys.<escena>`.
- **PNGTuber:** reemplaza el archivo (por ejemplo `assets/pngtuber/celebrate.apng`)
  o cambia la ruta `file` en `assets.json`.

La lista de escenas de serie y sus archivos está en la
[guía PNGTuber](pngtuber.md#2-agrega-tus-clips).

### Una actividad nueva (no termina sola)

Para algo que dure mientras el agente trabaja, usa `"layer": "activity"`. Por
ejemplo, Alba "investigando" mientras el agente busca en internet:

```json
"investigando": { "layer": "activity", "clip": "investigando" }
```

y una regla con `"when": { "type": ["tool.start", "tool.end"], "tool": "webfetch" }`.
Alba sale de una actividad cuando llega otra o cuando opencode queda en reposo
(`session.idle` → `idle`).

### Cambiar cuánto dura una reacción

`durationMs` en la escena (en milisegundos). Hay un mínimo global en
`config/persona.json` (`minStateDurationMs`, 1,2 s por defecto) para que Alba no
parpadee, y un máximo de reacciones por minuto (`maxTransientsPerMinute`).

### Hacer que Alba esté más tranquila o más expresiva

- Más tranquila: sube `cooldownMs` en las reglas o baja `maxTransientsPerMinute`
  en `persona.json`.
- Más expresiva: baja los `cooldownMs` o añade reglas para más herramientas.
- Quitar una reacción automática: borra su regla de `rules.json`.

### Props (objetos en pantalla, solo VTuber)

Un PNG en `assets/props/`, registrado en `assets.json` con `"type": "item"`, y
listado en `"props"` de una escena o en `args.props` de un comando. Ver
[Añadir un recurso](adding-an-asset.md#props-solo-vtuber).

---

## Errores comunes

| Lo que pasa | Por qué | Arreglo |
|---|---|---|
| `alba wow` dice «Comando desconocido» | El JSON no se guardó o tiene un error | Mira la terminal del bridge y `npm run doctor` |
| El comando responde pero la cara no cambia (VTuber) | El ID del hotkey no es de este modelo | `npm run alba -- hotkeys` y copia el ID otra vez |
| La expresión se queda puesta (VTuber) | Es un toggle y `idle` no tiene hotkey para limpiar | Asigna *Remove All Expressions* a `idle` |
| Sale `idle` en vez de tu clip (PNGTuber) | Ruta o extensión distinta en `assets.json` | `npm run doctor` dice el motivo exacto de cada clip |
| Responde `transient-limit` | Muchas reacciones en un minuto | Espera o sube `maxTransientsPerMinute` |
| Responde `min-duration` | Pediste otra escena demasiado rápido | Se aplica sola un momento después |
| Alba no hace nada | Está dormida | `npm run alba -- ring ring` |
