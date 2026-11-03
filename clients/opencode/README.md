# Plugin local de opencode

Arranca `npm start` y abre opencode desde la raiz del proyecto. El cargador
`.opencode/plugins/alba.js` activa el plugin sin instalar paquetes ni tocar la
configuracion global. Lee el puerto y token de `.env` del repositorio.

Traduce `tool.execute.before` a `tool.start`, `tool.execute.after` a `tool.end`
(o `error` si hay un exit distinto de cero), `session.idle` a `session.idle`
y `session.created` a `session.start`. Los errores de sesion y de herramientas
(`message.part.updated` con estado `error`) tambien generan `error`.
No reenvia argumentos, salidas, mensajes ni contenido de archivos.

La cola HTTP mantiene el orden, admite 32 eventos pendientes y no bloquea las
herramientas del agente. Si el bridge falla, avisa una vez y sigue intentando
en los eventos siguientes. Las reglas y las escenas viven en `config/`.
