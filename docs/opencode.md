# Conectar opencode y comprobar que funciona

Alba se entera de lo que hace opencode por dos caminos independientes:

| Camino | Qué hace | Automático |
|---|---|---|
| **Plugin** (`.opencode/plugins/alba.js`) | Avisa a Alba de cada herramienta que usa el agente, de los errores y de cuándo termina. Es lo que la hace **reaccionar sola**. | Sí |
| **MCP** (`opencode.json`) | Le da al agente herramientas como `avatar_say` o `avatar_scene` para que **él** decida hablar o poner una cara. | Solo si se lo pides |

Los dos vienen configurados en el repositorio y no instalan nada global.

## Requisito importante: abrir opencode desde la carpeta de Alba

opencode solo carga el plugin y el MCP **del proyecto en el que lo abres**. Hoy
Alba reacciona cuando abres opencode desde la carpeta de Alba-vt:

```powershell
cd ruta\a\Alba-vt
opencode
```

Si abres opencode en otro proyecto, Alba no se entera. Para usarla con todos tus
proyectos hace falta instalar el plugin de forma global; eso queda para la fase
de instalación (ver el [roadmap](../README.md#roadmap)).

## Comprobación paso a paso

### 1. Arranca el bridge

En una terminal, desde la carpeta de Alba:

```powershell
npm start
```

Déjala abierta. Debe decir `bridge escuchando en http://127.0.0.1:8790`.

### 2. Mira el estado antes de usar opencode

En otra terminal:

```powershell
npm run alba -- status
```

Verás algo así:

```
Bridge: activo
Modo: pngtuber | ventana conectada
Alba: despierta | escena idle
Eventos: todavia no llego ninguno.
```

### 3. Usa opencode

En una tercera terminal, abre opencode desde la carpeta de Alba y pídele algo
que use herramientas, por ejemplo «lista los archivos de la carpeta docs».

### 4. Vuelve a mirar el estado

```powershell
npm run alba -- status
```

Si el plugin funciona aparece una línea `opencode`:

```
Eventos recibidos (6 en total):
  opencode: 6 | ultimo session.idle hace 3 s
```

- **Aparece `opencode`** → está conectado. Alba debería haber cambiado de cara
  mientras el agente trabajaba (`reading` al leer, `coding` al editar o ejecutar
  comandos, `celebrate` al terminar bien).
- **Dice «todavia no llego ninguno»** → el plugin no está enviando nada. Mira
  [Problemas frecuentes](#problemas-frecuentes).
- **Dice «ignorado porque dormia»** → llegan eventos pero Alba está dormida:
  `npm run alba -- ring ring`.

`alba status` también te dice si la ventana PNGTuber o VTube Studio están
conectados.

### 5. Comprueba el MCP (opcional)

Desde la carpeta de Alba:

```powershell
opencode mcp list
```

Debe aparecer `alba` como conectado. Después pídele al agente, dentro de
opencode: «usa la herramienta avatar_say de alba para decir hola». En PNGTuber
verás el globo con el texto; en VTuber, Alba mueve la boca. En `alba status`
aparecerá una línea `mcp`.

## Qué eventos envía opencode

El plugin solo envía **el tipo de evento y el nombre de la herramienta**.
Nunca envía tus mensajes, el contenido de los archivos, los comandos ni sus
salidas.

| Lo que pasa en opencode | Evento que llega a Alba | Reacción de serie |
|---|---|---|
| Empieza una sesión | `session.start` | `thinking` |
| El agente empieza a usar una herramienta | `tool.start` + nombre | `coding` o `reading` según la herramienta |
| La herramienta termina bien | `tool.end` con `ok: true` | `celebrate` (como mucho cada 15 s) |
| Un comando sale con error, o falla una herramienta o la sesión | `error` | `error`; si se repite, `angry` y luego `sad` |
| El agente termina y queda esperando | `session.idle` | `idle` |

Herramientas que reconocen las reglas de serie:

- **`coding`**: `bash`, `edit`, `write`, `patch`, `apply_patch`
- **`reading`**: `read`, `grep`, `glob`, `list`, `search`

Cualquier otra herramienta (`webfetch`, `task`, `todowrite`…) llega igual, pero
no tiene regla; puedes añadirla siguiendo [Crea tus propias cosas](customize.md#paso-4-que-reaccione-sola-opcional).

## Problemas frecuentes

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `alba status` dice «Bridge no disponible» | El bridge no está arrancado | `npm start` en otra terminal |
| `alba status` da `Bridge HTTP 401` | Token distinto entre `.env` y el bridge | Reinicia `npm start` después de cambiar `.env` |
| No aparece `opencode` en `alba status` | opencode se abrió desde otra carpeta | Ciérralo y ábrelo desde la carpeta de Alba |
| No aparece `opencode` y sí lo abriste desde ahí | opencode se abrió antes de existir el plugin, o el plugin dio error | Reinicia opencode; mira sus logs (servicio `alba`) |
| opencode muestra «Alba: bridge no disponible» | El plugin no llega al bridge | Arranca `npm start`; el plugin vuelve a intentar con el siguiente evento |
| opencode muestra «Alba: revisa .env» | Falta `ALBA_TOKEN` o el puerto es inválido | Corrige `.env` y reinicia opencode |
| Llegan eventos pero Alba no cambia | Dormida, o la ventana/VTS desconectados | Lee las otras líneas de `alba status` |
| Alba cambia demasiado | Reglas muy sensibles | Sube `cooldownMs` en `config/rules.json` |

Detalles técnicos del plugin: [`clients/opencode/README.md`](../clients/opencode/README.md).
Del servidor MCP: [`clients/mcp/README.md`](../clients/mcp/README.md).
