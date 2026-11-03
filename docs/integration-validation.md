# Validacion local de Fase 0

Comprobado el 3 de noviembre de 2026:

- `npm run doctor` contra **VTube Studio real**, API 8001: autenticado, token
  guardado, modelo Akari, 7 hotkeys y 127 parametros. Avisos: faltan keyboard/mug
  y no esta concedido LoadCustomImagesAsItems. Son capacidades opcionales.
- CLI contra el bridge VTS: good night -> sleep; ring ring -> idle; lights out
  sin confirmacion se cancela. No se cerro ni lanzo VTS.
- curl real: tool.start/bash -> decision coding y escena efectiva coding.
- opencode **1.19.5**: `opencode mcp list` muestra **alba connected** con el
  servidor stdio sin SDK. Reiniciar la comprobacion vuelve a conectar.
- `opencode run` solicito avatar_status, avatar_say y avatar_scene. Su modelo
  predeterminado big-pickle fallo antes de ejecutar tools con **Free usage limit
  reached**. Por tanto, las llamadas de tools desde un agente opencode y la
  observacion visual de la boca quedan pendientes de cuota/modelo disponible.
- Las pruebas automaticas usan fake y un servidor WebSocket que simula VTS.
  Tambien arrancan el proceso MCP real por stdio y ejercitan las seis tools contra
  HTTP de prueba. No sustituyen la comprobacion contra VTS real descrita arriba.

Opencode genera su propio package.json/node_modules ignorado dentro de
`.opencode/` al cargar plugins locales. Esa cache pertenece a opencode; Alba
solo declara ws y dotenv y el MCP no importa el SDK ni paquetes de esa cache.

Para repetir la prueba con cuota disponible: arranca `npm start`, ejecuta
`opencode mcp list` y pide en opencode: «Usa avatar_status, luego avatar_say con
Hola Alba y avatar_scene con coding. No cierres ni lances VTS». Comprueba las
respuestas y el movimiento en VTS. El limite del director puede mantener un
transiente por encima de coding hasta que expire; /state muestra ambas capas.
