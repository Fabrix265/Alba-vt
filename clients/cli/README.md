# CLI Alba

Con `npm start` activo, desde el proyecto:

```sh
npm run alba -- list
npm run alba -- hotkeys
npm run alba -- amor
npm run alba -- reset
npm run alba -- good night
npm run alba -- ring ring
npm run alba -- lights out
```

Tambien funciona `node clients/cli/alba.mjs <frase>`. El bin `alba` esta declarado
en package.json; la instalacion global con `npm link` requiere aprobacion aparte.
No hace falta instalarlo para usar los comandos locales.

El bridge resuelve las frases usando la ultima version valida de commands.json.
`alba hotkeys` lista nombre e ID de todos los hotkeys que anuncia el modelo
cargado, incluidos los que no tienen binding y los que no tienen nombre. No
activa expresiones; requiere el bridge con adapter VTS conectado y un modelo.
El catalogo se actualiza periodicamente, normalmente cada 2 segundos.

Consulta el [catalogo y la guia para añadir comandos](../../docs/adding-a-command.md):
frases, alias, expresiones, bindings y escenas temporales se configuran desde JSON.

`lights out` pregunta y/N; en una entrada no interactiva cancela. `--yes` solo lo
debe indicar el usuario para autorizar esa operacion. HTTP y MCP tambien exigen
`confirmed: true` para deep_sleep, aunque alguien quite confirm del JSON.

El control de procesos esta desactivado por defecto: deep_sleep se degrada a
sleep y avisa que VTS sigue abierto. Para habilitarlo, configura en tu `.env`
`VTS_PROCESS_CONTROL=true` y `VTS_CLOSE_COMMAND` como un array JSON de ejecutable
y argumentos. `VTS_LAUNCH_COMMAND` usa el mismo formato: debe ser un launcher que
regresa al abrir VTS. No se interpretan comandos de shell. Configura un cierre
que afecte exclusivamente a VTS. Sin launcher, wake pide abrir VTS manualmente.
Con launcher, wake desde deep_sleep tambien solicita confirmacion.

Los comandos de procesos no se exponen en /state y no se ejecutan durante tests.
