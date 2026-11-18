# Plugin local de opencode

Para activarlo y comprobar que funciona, sigue [Conectar opencode](../../docs/opencode.md).

Arranca `npm start` y abre opencode desde la raiz del proyecto. El cargador
`.opencode/plugins/alba.js` activa el plugin sin instalar paquetes ni tocar la
configuracion global. Lee el puerto y token de `.env` del repositorio.

Traduce `tool.execute.before` a `tool.start`, `tool.execute.after` a `tool.end`
(o `error` si hay un exit distinto de cero), `session.created` a `session.start`,
`session.status` busy/idle a `session.busy`/`session.idle` y los errores de
sesion o de herramientas a `error`. De `message.part.updated` solo usa la fase:
`step-start` y `reasoning` dan `reasoning`; el texto del asistente da
`response.start` al empezar y `response.end` al terminar (el texto del usuario se
ignora). Recuerda que partes ya anuncio para enviar un evento por fase y no uno
por cada trozo de texto. Con `ALBA_SPEAK_RESPONSES=true` (por defecto) envia
ademas un evento `say` por cada frase completa de la respuesta del asistente,
sin bloques de codigo ni markdown (`sentences.mjs`), solo al bridge local. No
reenvia argumentos, salidas de comandos, tus mensajes ni contenido de archivos.

La cola HTTP mantiene el orden, admite 32 eventos pendientes y no bloquea las
herramientas del agente. Si el bridge falla, avisa una vez y sigue intentando
en los eventos siguientes. Las reglas y las escenas viven en `config/`.
