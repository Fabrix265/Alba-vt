# Validacion local de Fase 0

Comprobaciones anteriores al cierre del Paso 6, el 3 de noviembre de 2026:

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
  observacion visual de la boca quedan **PENDIENTES de verificacion manual por
  el usuario**. Por instruccion posterior no se reintenta opencode ni se cambia
  de modelo durante el cierre de Fase 0.
- Las pruebas automaticas usan fake y un servidor WebSocket que simula VTS.
  Tambien arrancan el proceso MCP real por stdio y ejercitan las seis tools contra
  HTTP de prueba. No sustituyen la comprobacion contra VTS real descrita arriba.

En las **dos ultimas ejecuciones** del cierre posterior del Paso 6, doctor **no
pudo conectar a VTS**, incluida la repeticion fuera del sandbox. La demo completo los cinco estados con fake y con
el bridge existente, que anuncio VTS desconectado. Por tanto, aquel doctor OK es
evidencia historica, no el estado actual. No se ejecutaron opencode ni npm test
en este cierre. La [revision de Fase 0](phase-0-review.md) detalla los pendientes.

Opencode genera su propio package.json/node_modules ignorado dentro de
`.opencode/` al cargar plugins locales. Esa cache pertenece a opencode; Alba
solo declara ws y dotenv y el MCP no importa el SDK ni paquetes de esa cache.

Solo para la comprobacion manual del usuario, con cuota disponible: arranca `npm start`, ejecuta
`opencode mcp list` y pide en opencode: «Usa avatar_status, luego avatar_say con
Hola Alba y avatar_scene con coding. No cierres ni lances VTS». Comprueba las
respuestas y el movimiento en VTS. El limite del director puede mantener un
transiente por encima de coding hasta que expire; /state muestra ambas capas.

## Comprobacion posterior de la pose de dormir

Tras configurar los hotkeys de Akari, VTS volvio a estar conectado. Se corrigio
sleep para mantener solo sus parametros fijos a baja frecuencia, con un intervalo
configurado de 500 ms. Se verifico con `node --check` y observando la ventana real
de VTS: good night mostro ojos y boca cerrados y cabeza inclinada; una captura
posterior confirmo que la pose seguia aplicada. ring ring devolvio idle y Akari
recupero los ojos abiertos y la postura normal. Las capturas de comprobacion
quedaron en assets/ ignorado, fuera del commit. No se ejecutaron tests ni opencode,
ni se cerro VTS. Los eventos del agente siguen ignorados durante sleep por el
guard existente del core; no se ejecuto una prueba automatica de ese guard.

## Comprobacion posterior de los comandos de expresion

Se corrigio la deteccion del archivo principal para que la CLI arranque tambien
desde el enlace global de npm ya existente; no se modifico la instalacion global.
`node --check` paso en clients/cli/alba.mjs y src/environment.mjs. Contra el bridge
VTS conectado, `alba hotkeys` mostro los siete hotkeys de Akari con nombre e ID,
incluido uno sin nombre. `alba list` mostro los comandos recargados desde JSON.
Se ejecutaron `alba ring ring`, `alba amor`, `alba sacudida` y `alba reset`:
devolvieron idle, celebrate, shake y reset. Una consulta posterior al bridge
confirmo el regreso automatico a idle tras amor y tras reset, con VTS conectado.
Esta comprobacion verifica comandos y estado; no certifica visualmente todas
las expresiones. No se ejecutaron pruebas, opencode ni operaciones de procesos.
