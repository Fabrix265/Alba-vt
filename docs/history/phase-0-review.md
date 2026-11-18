# Revision de Fase 0 — 3 de noviembre de 2026

Implementados los pasos 1–6. La aceptacion completa sigue pendiente de las
comprobaciones manuales indicadas abajo. Se detiene aqui el desarrollo: no se
inicia Fase 2 (TTS), publicacion, instaladores ni documentacion de la fase final.

Esta revision se hizo por lectura y con las verificaciones locales autorizadas:
`node --check`, import de modulos, `npm run doctor`, `npm run demo` y su variante
`--fake`. En este cierre **no se escribieron pruebas ni se ejecuto npm test,
opencode o un modelo**. No se instalaron dependencias ni se cerro/lanzo VTS.

Al retomar la sesion se revisaron git status y git diff --stat: solo quedaban
estos documentos y los ajustes del README sin commit. El control de duraciones
ya estaba completo en 1e4cd8f. Se repitio node --check sobre siete archivos de
codigo (todos OK) y npm run demo -- --fake completo otra vez la secuencia. No se
ejecuto de nuevo doctor: **sus dos ultimas ejecuciones no conectaron con VTS**.

## Criterios del apartado 13 del prompt

| Criterio original | Estado | Evidencia y limite |
|---|---|---|
| Doctor conecta con VTS, guarda token, detecta modelo y lista assets | pendiente | La ejecucion anterior detecto Akari, 7 hotkeys y 127 parametros. En este cierre fallo la conexion a VTS, tambien fuera del sandbox. Node, token del bridge y schemas OK; faltan keyboard y mug. Repetir con VTS/API disponible. |
| Demo idle → thinking → coding → celebrate → idle | hecho | Secuencia completa con fake y contra el bridge existente, que informo VTS desconectado. Falta observar visualmente la secuencia en VTS. |
| Desde opencode: avatar_say mueve la boca, una herramienta dispara coding y un error dispara error | pendiente | Las llamadas MCP y los hooks automaticos reales quedan para el usuario. El handshake previo funciono; el modelo agoto cuota antes de llamar tools. La regla para el primer error ya esta en JSON. |
| good night duerme, ring ring despierta y lights out pide confirmacion | hecho | CLI local comprobado contra VTS antes de este cierre: sleep, idle y cancelacion sin confirmacion. Se reviso la confirmacion central en el bridge. El bin global no se instalo; usar npm run alba -- <frase>. |
| Con PNG aparece teclado; sin PNG funciona con un solo aviso | no verificado | Sin PNG, demo completa y un aviso por recurso ausente. Unificados los avisos del registro y del adapter. La carga visual con PNG/permiso no se verifico y queda pendiente manual. |
| Con VTS cerrado, bridge vivo y degradacion registrada | hecho | El bridge existente respondio a toda la demo con VTS/API inaccesible y lo informo. Por lectura, el adapter avisa una vez y reintenta. No se forzo un cierre de VTS; falta repetir el ciclo manual de reapertura. |
| Reiniciar opencode no rompe nada | no verificado | Antes del cierre se repitio MCP list con conexion correcta. No equivale a reiniciar una sesion con hooks y tools activos; queda manual. |
| Cambiar Akari → otro modelo solo requiere bindings.json | no verificado | Deteccion por nombre/ID y bindings revisados por lectura; falta cambio de modelo real con hotkeys/parametros propios. |
| npm test pasa con fake, sin VTS abierto | no verificado | No ejecutado por instruccion del usuario. La ultima suite completa anterior tuvo 94 pruebas correctas, antes de estos cambios; no valida el estado actual. |
| JSON validado contra schemas y config invalida conserva ultima valida | hecho | Doctor valido todos los JSON, incluidas las nuevas condiciones when.state. El cargador conserva por lectura el ultimo archivo valido ante errores; no se provoco una recarga invalida en este cierre. |

## Comprobaciones manuales pendientes

1. Reiniciar el bridge para cargar los cambios de codigo (los JSON se recargan
   solos). Abrir/habilitar VTS manualmente y repetir doctor y demo, observando la
   animacion real. El fallo actual no permite concluir si VTS esta cerrado o si
   la API esta desactivada/inaccesible.
2. Desde opencode, cuando el usuario disponga de modelo/cuota, llamar las seis
   tools MCP. Observar la boca sintetica, coding y error mediante una herramienta
   real. Probar sleep/wake sin autorizar cierre/lanzamiento y reiniciar opencode.
   **Esta prueba queda PENDIENTE; el agente no la ejecutara ni seleccionara otro
   modelo para hacerla.**
3. Probar teclado con un PNG propio/autorizado y permiso de items. Volver a
   comprobar la degradacion sin el archivo, y probar otro modelo con sus bindings.
4. Comprobar manualmente desconexion/reconexion de VTS y recarga de un JSON
   invalido/restaurado. Observar tambien las transiciones rapidas: los cambios
   aplazados por duracion minima deben terminar en la ultima escena solicitada.
5. El cierre/lanzamiento real queda sin verificar y desactivado por defecto.
   No es necesario activarlo para la demo. Cualquier prueba futura exige permiso
   explicito por operacion; no se ejecuto lights out con confirmacion real.
6. Si el usuario lo decide mas adelante, ejecutar la suite existente. En esta
   entrega no hay resultado nuevo de pruebas automaticas.

## Inconsistencias encontradas

- **Corregidas:** README y docs/vts-adapter seguian anunciando clientes, doctor o
  demo pendientes. Ahora distinguen implementacion y validacion manual.
- **Corregida:** README describia VTS_LAUNCH_COMMAND como ruta o URL suelta; el
  codigo acepta un array JSON de ejecutable/argumentos sin shell. Tambien se
  explican el opt-in, VTS_CLOSE_COMMAND y las confirmaciones de cierre/lanzamiento.
- **Corregidas:** faltaban la reaccion al primer error y las condiciones de estado
  prometidas por el prompt. El director solo limitaba cambios entre actividades;
  ahora limita tambien cambios de fondo y reemplazos de transientes, conservando
  solicitudes aplazadas. Los avisos de assets ausentes podian duplicarse.
- **Corregidas:** README enlazaba guias vacias como si estuvieran completas y usaba
  cooldown/debounce como nombres de campos; ahora enlaza documentos existentes y
  usa cooldownMs/debounceMs. Las guias completas siguen fuera de esta fase.
- **Historica, conservada:** el apartado 11 del prompt dice que no habia token y
  la API estaba cerrada. Es la fotografia de arranque; hubo una conexion real
  autorizada despues. No se reescribio el prompt original para ocultar esa historia.
- **Limites intencionales:** AGENTS exige confirmacion de procesos y degradacion;
  por eso deep_sleep sin control configurado produce sleep con aviso. El adapter
  VTS declara processControl=false; las capacidades de cierre/lanzamiento se
  publican por separado en /state.processControl, desde la capa de plataforma.
- **No verificado:** la atribucion/licencia exacta de Akari en CREDITS.md necesita
  contrastarse con la licencia del modelo antes de publicar. No se investigo en
  red ni se redistribuyo arte durante esta tarea.

## Commits de esta continuacion

| Hash | Cambio |
|---|---|
| 1f391ef | Excluir cache de opencode y dejar la prueba MCP como pendiente manual |
| 85148bb | Paso 6: demo, primera reaccion de error y condiciones de estado |
| 19848e0 | Unificar avisos de recursos opcionales |
| 1e4cd8f | Duraciones minimas y peticiones de escena aplazadas |

El commit que contiene esta revision y los ajustes del README se identifica en
el historial con el mensaje `Fase 0: documentar cierre y verificaciones manuales`.

Los pasos anteriores ya estaban commiteados al iniciar: 2fe56ad (doctor),
4034a96 (plugin), 17b5f69 (CLI), 6c39c66 (HTTP), 7ab2b0e (seguridad HTTP/SSE) y
198b7f5 (MCP). Solo se versiona `.opencode/plugins/alba.js` de `.opencode/`;
`.env`, caches y arte de terceros quedan excluidos. Dependencias: ws y dotenv.
