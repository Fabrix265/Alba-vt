# Añadir un modelo Live2D (modo VTuber)

Alba no da por hecho ningún modelo concreto. Cada modelo tiene sus propias
expresiones (hotkeys) y, a veces, sus propios nombres de parámetros. Esta guía
conecta un modelo nuevo; para crear expresiones nuevas sobre él, sigue después
[Crea tus propias cosas](customize.md).

## Qué necesitas

- VTube Studio con el modelo cargado y **Allow Plugin API access** activado.
- El modelo en tu equipo. Si es de otra persona, anota autor, enlace y licencia
  en [`CREDITS.md`](../CREDITS.md). Los modelos no se suben al repositorio.

## 1. Mira qué trae el modelo

```powershell
npm run doctor
```

Con el modelo cargado, doctor muestra:

- `Modelo: <nombre> | ID: <id>`: el nombre y el ID que usa Alba para reconocerlo.
- **Hotkeys reales**: nombre, ID y tipo de cada expresión o animación.
- **Parámetros de entrada**: los nombres que acepta VTS (`FaceAngleX`,
  `MouthOpen`, `EyeOpenLeft`…).
- **Bindings**: si a tu modelo le falta alguno de los parámetros que usa Alba.

Con el bridge arrancado también puedes usar `npm run alba -- hotkeys`.

## 2. Añade el modelo a `config/bindings.json`

Dentro de `"models"`, crea una entrada. La clave es un nombre corto tuyo:

```json
"models": {
  "akari": { "...": "..." },
  "mi-modelo": {
    "match": ["Nombre Exacto Del Modelo", "id-del-modelo-que-dio-doctor"],
    "hotkeys": {
      "celebrate": "ID-de-tu-expresion-feliz",
      "sad": "ID-de-tu-expresion-triste",
      "angry": "ID-de-tu-expresion-enojada",
      "error": "ID-de-tu-expresion-sorpresa",
      "idle": "ID-de-Remove-All-Expressions"
    },
    "parameters": {}
  }
}
```

- **`match`**: Alba compara el ID del modelo y luego su nombre con la clave y con
  esta lista (sin distinguir mayúsculas). Basta con que uno coincida.
- **`hotkeys`**: escena → ID (o nombre) del hotkey en VTS. Solo pon las que tu
  modelo tenga; las demás escenas usan movimientos de cabeza (parámetros) como
  plan B.
- **`idle`** es especial: se ejecuta al volver a reposo para **quitar** las
  expresiones que se quedaron puestas. Si tu modelo no tiene un hotkey
  *Remove All Expressions*, créalo en VTS y ponlo aquí.
- **`parameters`**: solo si tu modelo usa nombres distintos de los de
  `default` (ver abajo). Si no, déjalo vacío.

Guarda. El bridge recarga el archivo solo.

## 3. Parámetros (solo si doctor avisa)

`default.parameters` traduce los nombres que usa Alba en `scenes.json`
(`angleX`, `smile`, `mouth`…) a parámetros de VTS. Funcionan con casi todos los
modelos. Si doctor dice `entradas ausentes para brow`, mira la lista de
parámetros de entrada y sobrescribe solo ese:

```json
"mi-modelo": {
  "match": ["Mi Modelo"],
  "parameters": { "brow": "BrowLeftY" }
}
```

Son **parámetros de entrada de VTS**, no los internos de Live2D
(`ParamMouthOpenY` no sirve aquí).

## 4. Comprueba

```powershell
npm run doctor        # Bindings: <mi-modelo>: parametros verificados
npm run alba -- amor  # tu expresión de celebrate
npm run alba -- reset # se limpia
```

Si una expresión no aparece, la terminal del bridge avisa una vez
`VTS: falta el hotkey para <escena>`: el ID no pertenece a este modelo.

## Cambiar de modelo

Carga otro modelo en VTS: Alba lo detecta en unos 2 segundos y usa sus
bindings. Si no tiene entrada en `models`, usa `default` (solo movimientos,
sin expresiones). No hace falta reiniciar nada.
