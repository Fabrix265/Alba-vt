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
  comandos, `answering` mientras responde).
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

Alba es un **reflejo** de opencode: hace lo mismo que el agente en cada
momento y **dice lo que opencode responde**. El plugin envía el tipo de evento,
el nombre de la herramienta y, si `ALBA_SPEAK_RESPONSES=true` (por defecto), las
frases de la respuesta del agente. Nunca envía tus mensajes, el contenido de los
archivos, los comandos ni sus salidas, y el texto de la respuesta solo viaja al
bridge en `127.0.0.1`: no sale de tu equipo.

| Lo que hace opencode | Evento que llega a Alba | Alba |
|---|---|---|
| Recibe tu mensaje y empieza a trabajar | `session.busy` (o `session.start` en una sesión nueva) | `thinking` |
| El modelo piensa (antes de cada paso o al razonar) | `reasoning` | `thinking` |
| Lee archivos o busca | `tool.start` + `read`, `grep`, `glob`, `list`, `webfetch`… | `reading` |
| Escribe archivos o ejecuta comandos | `tool.start` + `write`, `edit`, `bash`, `patch`… | `coding` |
| Escribe la respuesta en pantalla | `response.start`, `say` por cada frase, `response.end` | `answering`: **habla** y su globo muestra la respuesta frase a frase |
| Algo falla | `error` | `error`; si se repite, `angry` y luego `sad` |
| Termina y queda esperando | `session.idle` | `idle`, **cuando Alba termina de decir la respuesta** |

Notas:

- Terminar una herramienta (`tool.end`) **no** cambia nada: Alba sigue en lo que
  esté hasta que opencode pase a otra fase.
- No celebra al terminar: piensa mientras opencode trabaja, dice la respuesta
  completa y después vuelve a reposo. `celebrate` queda para `alba hello`.
- Para que no parpadee, cada escena dura como mínimo 0,6 s
  (`minStateDurationMs` en `config/persona.json`). Si opencode cambia más
  rápido, Alba salta directo a la fase más reciente.
- Con `ALBA_LOG_EVENTS=true` en `.env`, la terminal del bridge muestra cada
  evento y la escena que provocó: es la forma más rápida de ver si va
  sincronizada.

### Alba dice la respuesta de opencode

Mientras opencode escribe, el plugin corta su respuesta en frases y se las pasa
a Alba, que las escribe en su globo letra por letra y mueve la boca:

- Los **bloques de código** no se dicen; tampoco los símbolos de markdown.
- Dice **todas** las frases, una tras otra, al ritmo en que se escriben y se
  leen en el globo. Si opencode termina antes, Alba sigue hablando y vuelve a
  reposo al acabar.
- Si mandas un mensaje nuevo, lo que quedaba por decir de la respuesta anterior
  se descarta y empieza a pensar el nuevo.
- **Respuestas muy largas:** dice hasta 900 caracteres por respuesta (unas 6 a
  10 frases, cerca de un minuto) y después avisa con una frase como «el resto
  te lo dejé escrito en opencode». Ajusta el límite con
  `settings.responseMaxChars` en `config/phrases.json` (`0` = sin límite).
- Mientras lee la respuesta, sus frases propias esperan.
- Para apagarlo: `ALBA_SPEAK_RESPONSES=false` en `.env` y reinicia opencode.
- Cuando llegue la voz (Fase 2), estas mismas frases serán las que diga en voz
  alta.

Además, Alba tiene **frases propias** para cada momento (pensar, leer,
programar, terminar, errores…) en `config/phrases.json`. Ver
[Crea tus propias cosas → Frases de Alba](customize.md#frases-de-alba).

Cualquier herramienta sin regla (`task`, `todowrite`…) llega igual pero no cambia
la escena; puedes añadirla siguiendo [Crea tus propias cosas](customize.md#paso-4-que-reaccione-sola-opcional).

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
| Alba se queda en `coding` o no piensa ni habla | El bridge o opencode siguen con código anterior (los JSON se recargan solos; el código no) | Cierra y vuelve a abrir `npm start` **y** opencode después de actualizar Alba |

Detalles técnicos del plugin: [`clients/opencode/README.md`](../clients/opencode/README.md).
Del servidor MCP: [`clients/mcp/README.md`](../clients/mcp/README.md).
