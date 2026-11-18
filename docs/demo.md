# Demo

Con `npm start` activo y Alba despierta, ejecuta `npm run demo` en otra terminal.
Envia exclusivamente eventos canonicos por HTTP al bridge local:

| Evento | Resultado esperado |
|---|---|
| session.idle | idle |
| session.start | thinking |
| tool.start (bash) | coding |
| response.start | answering |
| session.idle (fin del turno) | idle (al terminar la frase que este diciendo) |

Respeta la duracion minima configurada y espera a que Alba termine de hablar. Si hay
otros clientes activos o modificaste las reglas, informa de la escena observada
cuando difiere de la esperada. No cambia la configuracion ni reinicia el bridge;
se puede repetir en cuanto termina.
No despierta a Alba, cierra VTS ni ejecuta herramientas del sistema. Con
`ALBA_ADAPTER=pngtuber`, la misma secuencia mueve la ventana y cambia de clip;
un clip ausente solo muestra el marcador.

`npm run demo -- --fake` usa el mismo core y JSON con un reloj local acelerado y
el adapter fake: no abre conexiones, no necesita VTS ni token y solo imprime la
secuencia. Los props de la salida son los **solicitados**; que aparezcan en la
pantalla depende del archivo y los permisos. Sin PNG la secuencia sigue completa.

Las reglas de rules.json reflejan las fases del agente: thinking (empieza o
piensa), reading y coding (segun la herramienta), answering (escribe la
respuesta, con la boca en movimiento) e idle (reposo, cuando termina de decir la
respuesta). celebrate queda para los comandos manuales como `alba hello`. Los errores dan error, y
angry (2 errores/30 s) o sad (3 errores/120 s) si se repiten; sad tiene
prioridad sobre angry. Las reglas de fase no tienen cooldown: el director evita
el parpadeo con minStateDurationMs y aplica siempre la fase mas reciente.

Las condiciones `when.state` admiten asleep, deepSleep, effective, base y activity
(incluido null). Por ejemplo, sesion-inicio exige asleep=false. El estado procede
del director, independientemente del cliente que envie el evento.

El director aplica minStateDurationMs a los cambios de base/actividad y al
reemplazo de un transiente. Conserva la ultima peticion aplazada por grupo y la
aplica en tick: un session.idle rapido no deja a Alba atascada en coding. Los
transientes duran al menos ese minimo y mantienen prioridad sobre el fondo;
sleep/wake son inmediatos y descartan las peticiones aplazadas.
