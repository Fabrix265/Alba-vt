# Añadir y personalizar comandos

Con el bridge activo (`npm start`), consulta `alba list` y `alba hotkeys`.
Si no tienes el bin `alba` instalado, todos los ejemplos funcionan sustituyendo
`alba` por `npm run alba --` o `node clients/cli/alba.mjs`. No necesitas instalar
nada globalmente. `npm link` modifica el entorno fuera del proyecto y requiere
aprobación aparte.

Los comandos viven en `config/commands.json`. El bridge recarga los JSON al
guardar; no hace falta reiniciarlo. Conserva las entradas existentes, las comas
entre entradas y el campo `$schema`. Si un archivo no es válido, el bridge avisa
y conserva su última versión válida.

## Catálogo actual

Cada nombre de la primera columna se usa después de `alba`. Los ocho primeros
comandos ya existían; los demás añaden expresiones y alias fáciles de recordar.

| Comando | Intención | Qué se ve en Akari |
|---|---|---|
| `good night` | `sleep` | Ojos y boca cerrados, cabeza inclinada; mantiene la pose e ignora eventos y voz. |
| `ring ring` | `wake` | Vuelve a idle, libera la pose y ejecuta Remove Expressions. |
| `lights out` | `deep_sleep` | Pide confirmación; con control habilitado cierra VTS. Por defecto solo duerme y avisa. |
| `hello` | `celebrate` | Heart Eyes: ojos de corazón; escena de 3 s. |
| `focus` | `coding` | Mira hacia abajo; teclado solo con PNG y permiso de items. |
| `tea time` | `idle` | Remove Expressions al entrar en idle; taza solo con PNG y permiso. |
| `oops` | `error` | Shock Sign: símbolo de sorpresa; escena de 2,5 s. |
| `cheer` | `celebrate` | Heart Eyes; escena de 3 s. |
| `llorar`, `drama` | `sad` | Eyes Cry: ojos llorosos; escena de 4 s. |
| `enojo`, `grrr` | `angry` | Angry Sign: símbolo de enfado; escena de 2,5 s. |
| `amor`, `flechazo` | `celebrate` | Heart Eyes; escena de 3 s. |
| `susto`, `buu` | `error` | Shock Sign; escena de 2,5 s. |
| `sacudida`, `gelatina` | `shake` | Activa la animación Anim Shake; escena de 3 s. |
| `reset` | `reset` | Remove Expressions; escena de 1,2 s y regreso a la actividad anterior. |

`list`, `hotkeys`, `help` y `--help` son funciones de la CLI, no entradas del JSON.
`hotkeys` consulta el catálogo del modelo cargado que mantiene el bridge y muestra
nombre e ID, incluso los hotkeys sin binding. Un nombre vacío aparece como
`(sin nombre)`. No activa expresiones. Si cambias de modelo o sus hotkeys, deja
que termine la siguiente actualización del bridge (normalmente unos 2 s).

Las duraciones de la tabla son de las **escenas**. Al expirar una escena temporal,
vuelve la actividad anterior: si era idle, se ejecuta Remove Expressions; si era
coding, vuelve coding y la expresión puede seguir activa. Las expresiones de
Akari son toggles y pueden combinarse. Usa `reset` para limpiarlas. La duración
interna de Anim Shake la decide VTS; `durationMs` no recorta el archivo de animación
y Remove Expressions no cancela animaciones.

`reset` respeta la pausa sleep, la duración mínima y el límite de transientes;
no despierta ni retira props. Para despertar y limpiar también actividades y
props, usa `ring ring`. Por defecto, el director permite seis transientes por
minuto (incluido reset) y un mínimo de 1,2 s por cambio; si ves `transient-limit`,
espera a que haya cupo, y si ves `min-duration`, la petición queda aplazada.

## 1. Añadir un comando mínimo

Añade esta entrada **dentro de `commands`** en `config/commands.json`:

```json
"apapacho": {
  "intent": "celebrate",
  "description": "Un abrazo con ojos de corazon"
}
```

Guarda y ejecuta `alba list`: aparecerá `apapacho`. Con `alba apapacho` se usa la
escena existente celebrate, vinculada a Heart Eyes en Akari. No necesitas tocar
código, reglas ni bindings para reutilizar una intención existente. Si Alba
está dormida, usa primero `alba ring ring`.

## 2. Renombrarlo o darle un alias

Cambia únicamente la clave `"apapacho"` por `"mimos"`. Guarda y usa `alba mimos`;
`alba apapacho` deja de existir. Para conservar ambos, duplica la entrada con
el segundo nombre. Los nombres distinguen mayúsculas y minúsculas; usa minúsculas
y espacios simples. No uses los nombres reservados `list`, `hotkeys`, `help`,
`--help` ni la opción `--yes` como comandos de expresión.

## 3. Elegir una expresión y su duración

Para que `mimos` tenga su propia duración sin cambiar hello, cheer o amor, añade
esta escena **dentro de `scenes`** en `config/scenes.json`:

```json
"carino": {
  "layer": "transient",
  "durationMs": 5000,
  "hotkey": "celebrate",
  "parameters": {
    "angleY": 5,
    "angleZ": 6,
    "smile": 0.85
  }
}
```

Después cambia la entrada de `mimos` en commands.json:

```json
"mimos": {
  "intent": "carino",
  "description": "Ojos de corazon durante una escena de 5 segundos"
}
```

La nueva intención se reconoce desde scenes.json. `hotkey: "celebrate"` reutiliza
el binding de ese modelo: en Akari apunta a Heart Eyes. Los parámetros quedan
como respaldo si falta o falla el hotkey. Para escoger otro efecto puedes usar
`sad` (Eyes Cry), `angry` (Angry Sign), `error` (Shock Sign), `shake` (Anim Shake)
o `idle` (Remove Expressions). Un binding con el nombre exacto de la intención
tiene prioridad sobre el campo `hotkey` de la escena.

`durationMs` va en la escena, no en commands.json ni en `args`. Para terminar
automáticamente en idle, comienza sin otra actividad:

```sh
alba ring ring
alba mimos
```

Sin nuevos eventos ni comandos, tras unos 5 s se retoma idle y se ejecuta Remove
Expressions. `ring ring` sirve aquí para cancelar actividades, transientes y
props previos. Desde deep_sleep, si está configurado lanzar VTS, pedirá confirmación.

## 4. Añadir un hotkey que todavía no tiene binding

Ejecuta `alba hotkeys` y copia el **ID** de la fila deseada. Por ejemplo, esta es
la entrada real añadida para Anim Shake **dentro de `models.akari.hotkeys`** en
`config/bindings.json`:

```json
"shake": "ab38a1f3991c4adaac4401221ec5b726"
```

Con una escena llamada `shake`, el adapter la resuelve automáticamente. Una
escena con otro nombre puede reutilizarla con `"hotkey": "shake"`, como en el
ejemplo de carino. Para otro efecto añade otra clave con el ID que muestre tu
modelo, su escena y el comando que dispare esa intención. No pongas el ID en
commands.json: pertenece a los bindings del modelo.

Si el hotkey no aparece en `alba hotkeys`, añadir su nombre al JSON no lo crea
en VTS: primero debe existir en ese modelo dentro de VTS. Si cambias de modelo
o recreas el hotkey, consulta su nuevo ID. Sin hotkey disponible se conserva el
respaldo por parámetros y se avisa una vez; en shake el respaldo es una pose
inclinada, no una animación de sacudida.
