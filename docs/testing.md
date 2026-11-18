# Cómo probar Alba

Una lista para comprobar que todo funciona, de lo más simple a lo más completo.
Cada paso dice **qué ejecutar** y **qué deberías ver**. Si un paso falla, no
sigas: arréglalo primero (la columna «Si no» te dice por dónde empezar).

Todo se ejecuta desde la carpeta del proyecto. Usa una terminal para el bridge
(`npm start`) y otra para los comandos.

## 0. Pruebas automáticas (sin VTS ni ventana)

```powershell
npm test
```

**Deberías ver** al final `fail 0`. No abren VTube Studio ni ventanas: usan un
avatar falso y un VTS simulado. Ejecútalas siempre después de tocar código.

## 1. Diagnóstico

```powershell
npm run doctor
```

**Deberías ver** `Doctor OK` al final. Los `[AVISO]` son cosas opcionales (un
clip o un prop que todavía no tienes); los `[ERROR]` hay que arreglarlos. Cada
línea dice cómo.

## 2. Demo sin nada abierto

```powershell
npm run demo -- --fake
```

**Deberías ver** la secuencia `idle → thinking → coding → answering → idle`
impresa en segundos. Comprueba que las reglas y escenas están bien, sin bridge,
VTS ni ventana.

---

## 3A. Modo PNGTuber

Requisito: `ALBA_ADAPTER=pngtuber` en `.env` y al menos
`assets/pngtuber/idle.*` (ver la [guía PNGTuber](pngtuber.md)).

| # | Ejecuta | Deberías ver | Si no |
|---|---|---|---|
| 1 | `npm start` | `bridge escuchando…` y `adapter: pngtuber`; se abre la ventana con Alba | [Problemas PNGTuber](pngtuber.md#problemas-frecuentes) |
| 2 | Mira la ventana | Punto **verde** arriba a la derecha | Rojo: la ventana no llega al bridge (token o puerto) |
| 3 | `npm run alba -- status` | `pngtuber \| ventana conectada` | «ventana sin conectar»: `npm run pet` |
| 4 | `npm run demo` | La ventana cambia de clip: thinking → coding → answering (habla) → idle | Sin clips propios verás `idle` siempre: es normal |
| 5 | `npm run alba -- hello` | Clip de `celebrate` unos 3 s | `transient-limit`: espera un minuto |
| 6 | Pide a tu agente «usa avatar_say para decir hola», o envía `{"type":"say","text":"hola"}` por [HTTP](../clients/http/examples.md) | Globo con «hola» y, si tienes `idle_talk`, la boca se mueve | Globo ausente: Alba dormida o ventana vieja (reinicia `npm start`) |
| 7 | `npm run alba -- good night` | Clip `sleep`, colores apagados; ignora eventos | — |
| 8 | `npm run alba -- ring ring` | Vuelve a `idle` | — |
| 9 | Pasa el ratón por el borde vacío de la ventana y haz clic | El clic llega al escritorio o a la ventana de detrás | Pulsa `Ctrl+Alt+A` si está en modo interacción |
| 10 | `Ctrl+Alt+A`, arrastra una esquina o usa la rueda del ratón, `Ctrl+Alt+A` | Alba cambia de tamaño; al reiniciar lo recuerda | Bandeja → Tamaño → Achicar |
| 10b | Mantén el clic sobre Alba sin mover el ratón unos segundos | La ventana **no** cambia de tamaño | — |
| 10c | `npm run alba -- pensar` y luego `npm run alba -- hello` | El clip cambia con un fundido corto, sin quedar vacía | Revisa `ALBA_PET_TRANSITION_MS` |
| 11 | Cierra `npm start` (Ctrl+C) | Si la ventana la abrió el bridge, se cierra con él | — |
| 12 | Abre `npm run pet` sin bridge | Marcador «Conectando con el bridge…», punto rojo | — |
| 13 | Arranca `npm start` con la ventana abierta | Se conecta sola en ~1,5 s; no se abre una segunda ventana | — |

## 3B. Modo VTuber

Requisito: `ALBA_ADAPTER=vtuber` en `.env`, VTube Studio abierto con un modelo y
**Allow Plugin API access** activado.

| # | Ejecuta | Deberías ver | Si no |
|---|---|---|---|
| 1 | `npm run doctor` | VTS, Autenticación, Modelo y Hotkeys en `[OK]` | La primera vez acepta el popup «Alba» en VTS |
| 2 | `npm start` | `adapter: vtuber` y, en VTS, el plugin conectado | [README → Solución de problemas](../README.md#solución-de-problemas) |
| 3 | `npm run alba -- status` | `vtuber \| VTube Studio conectado, modelo …` | «desconectado»: abre VTS y revisa la API |
| 4 | `npm run alba -- hotkeys` | Lista `Nombre \| ID` de tu modelo | — |
| 5 | `npm run demo` | El modelo piensa, mira hacia abajo, mueve la boca y vuelve a reposo | Modelo sin bindings: se usan parámetros genéricos |
| 6 | `npm run alba -- amor` | Expresión de `celebrate` (Heart Eyes en Akari) | Hotkey sin binding: [Añadir un modelo](adding-a-model.md) |
| 7 | `npm run alba -- reset` | Se limpian las expresiones | El modelo no tiene hotkey para `idle` |
| 8 | `npm run alba -- good night` | Ojos cerrados, cabeza inclinada; se mantiene | — |
| 9 | `npm run alba -- ring ring` | Vuelve el tracking normal | — |
| 10 | Cierra VTube Studio con el bridge arrancado | El bridge sigue vivo y avisa **una vez** | — |
| 11 | Vuelve a abrir VTS | Alba reconecta sola y recupera la escena | Reintenta cada 0,5–30 s |
| 12 | Quita un PNG de `assets/props/` y `npm run alba -- focus` | Alba programa igual, sin el teclado, con un aviso | — |

## 4. Conexión con opencode

Sigue [Conectar opencode → Comprobación paso a paso](opencode.md#comprobación-paso-a-paso).
Lo esencial: con `npm start` arrancado, abre opencode **desde la carpeta de
Alba**, pídele algo y ejecuta `npm run alba -- status`: debe aparecer una línea
`opencode`.

## 5. Tus propias expresiones

Después de añadir algo siguiendo [Crea tus propias cosas](customize.md):

1. `npm run doctor`: los JSON siguen siendo válidos y el clip o hotkey nuevo aparece.
2. `npm run alba -- list`: tu comando aparece.
3. Lánzalo y mira a Alba.
4. Si es una regla automática, provoca el evento desde opencode o con
   [HTTP](../clients/http/examples.md) y revisa `alba status`.

## 6. Resistencia (que nada se rompa)

| Prueba | Resultado esperado |
|---|---|
| Rompe un JSON de `config/` a propósito y guarda | El bridge avisa del error y sigue con la versión anterior |
| Arréglalo y guarda | `config recargada`; todo sigue igual |
| Reinicia opencode con el bridge arrancado | Alba sigue reaccionando al volver |
| Reinicia el bridge con opencode abierto | El plugin avisa una vez y reanuda solo |
| Borra temporalmente un clip o un prop | Aviso una vez; Alba sigue funcionando |

## Qué no se prueba automáticamente

`npm test` no abre la ventana real de Electron ni el VTube Studio real. Los
pasos 3A, 3B y 4 son manuales y conviene repetirlos antes de mezclar una rama.
