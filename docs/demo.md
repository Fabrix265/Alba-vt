# Demo de Fase 0

Con `npm start` activo y Alba despierta, ejecuta `npm run demo` en otra terminal.
Envia exclusivamente eventos canonicos por HTTP al bridge local:

| Evento | Resultado esperado |
|---|---|
| session.idle | idle |
| session.start | thinking |
| tool.start (bash) | coding |
| tool.end (bash, ok=true) | celebrate |
| session.idle y expiracion del transiente | idle |

Respeta la duracion minima configurada y espera a que termine celebrate. Si hay
otros clientes activos o modificaste las reglas, informa de la escena observada
cuando difiere de la esperada. No cambia la configuracion ni reinicia el bridge;
para repetirla espera el cooldown de fin-exitoso (15 segundos por defecto).
No despierta a Alba, cierra VTS ni ejecuta herramientas del sistema.

`npm run demo -- --fake` usa el mismo core y JSON con un reloj local acelerado y
el adapter fake: no abre conexiones, no necesita VTS ni token y solo imprime la
secuencia. Los props de la salida son los **solicitados**; que aparezcan en la
pantalla depende del archivo y los permisos. Sin PNG la secuencia sigue completa.

Las cinco reacciones base de rules.json son thinking (inicio), coding
(herramienta de escritura), celebrate (fin exitoso), idle (fin de sesion) y error
(primer fallo). Se conservan reading y los contadores adicionales angry
(2 errores/30 s) y sad (3 errores/120 s). Sad tiene prioridad sobre angry cuando
coinciden. Hay cooldowns y debounce; los contadores se reinician cuando disparan.

Las condiciones `when.state` admiten asleep, deepSleep, effective, base y activity
(incluido null). Por ejemplo, sesion-inicio exige asleep=false. El estado procede
del director, independientemente del cliente que envie el evento.
