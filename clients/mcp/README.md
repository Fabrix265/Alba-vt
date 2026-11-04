# MCP local por stdio

Implementacion ESM sin SDK ni dependencias adicionales. Lee puerto/token desde
`.env` del proyecto, envia peticiones al mismo bridge que el CLI y no conecta
directamente con VTS. Requiere `npm start` para ejecutar herramientas; el
handshake y tools/list funcionan incluso con el bridge apagado.

Desde la raiz del proyecto, `opencode mcp list` debe mostrar `alba` conectado.
`opencode.json` configura `node ./clients/mcp/server.mjs`. No contiene secretos.
Otros clientes pueden ejecutar Node con la ruta absoluta del servidor.

Tools: `avatar_status`, `avatar_say({text})`, `avatar_scene({scene,props?})`,
`avatar_hotkey({intent})`, `avatar_sleep({deep?,confirmed?})`,
`avatar_wake({confirmed?})`. hotkey recibe una **intencion de bindings.json**,
no un nombre/id de VTS, para respetar el director y los modelos intercambiables;
solo se anuncia en el modo `vtuber`, porque PNGTuber no usa hotkeys.
Consulta primero avatar_status para conocer las intenciones y capacidades.
say usa lip-sync sintetico, sin audio. Dormida, Alba ignora say y eventos.

Las tools se usan cuando el usuario las solicita. Para deep_sleep y lanzamiento
desde wake, pregunta al usuario antes de enviar confirmed=true. La confirmacion
se comprueba tambien en el bridge; nunca se deriva de una regla de comportamiento.

Protocolo: JSON-RPC 2.0 en lineas UTF-8, initialize, notifications/initialized,
ping, tools/list, tools/call. Versiones negociadas: 2025-11-25, 2025-06-18,
2025-03-26 y 2024-11-05. stdout contiene solo mensajes del protocolo; stderr,
diagnosticos sin secretos. No anuncia recursos, prompts, tareas ni subscriptions.
Procesa llamadas secuencialmente, limita las lineas a 64 KiB y devuelve isError
para fallos del bridge; los errores de protocolo llevan codigo JSON-RPC.

Referencias: [transporte stdio](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports),
[ciclo de vida](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle),
[tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools),
[configuracion opencode](https://opencode.ai/docs/mcp-servers/).
