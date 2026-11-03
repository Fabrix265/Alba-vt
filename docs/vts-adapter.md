# Adapter de VTube Studio (Paso 3)

El bridge usa VTS por defecto. Arranca con `npm start`, con la Plugin API activada y un modelo cargado. Acepta el popup de **Alba** la primera vez: el token se guarda en el `.env` del proyecto y se reutiliza en las conexiones siguientes. Un rechazo o un timeout de autorización no provoca más popups durante esa ejecución; reinicia el bridge cuando quieras volver a autorizarlo.

El HTTP arranca aunque VTS esté cerrado o esperando autorización. La reconexión usa esperas de 0,5 s, 1 s, 2 s… hasta 30 s. Al reconectar se autentica de nuevo y aplica el último estado del director. No reproduce eventos antiguos.

Para trabajar sin VTS, configura `ALBA_ADAPTER=fake` en `.env`. `VTS_PORT` y `ALBA_BRIDGE_PORT` también se leen de `.env`; los valores por defecto están en `.env.example`.

## Modelos y parámetros

El adapter consulta el modelo, los hotkeys, los parámetros de entrada y los permisos al conectar, y refresca estos datos cada 2 segundos. `getStatus()` expone ese inventario sin tokens, preparado para el doctor del Paso 4.

En `config/bindings.json`:

- `default` aporta los bindings comunes. `models` los sobrescribe por clave.
- Se compara el ID del modelo primero y su nombre después, con la clave o los alias de `match` (coincidencia completa, sin distinguir mayúsculas).
- `hotkeys` mapea intenciones a IDs o nombres de hotkeys de VTS.
- `parameters` mapea alias como `mouth` o `angleX` a **parámetros de entrada de VTS**, verificados contra `InputParameterListRequest`. Los parámetros internos de Live2D como `ParamMouthOpenY` no son intercambiables con esos nombres.

Los valores de respaldo viven en `scenes.json → scenes → <intención> → parameters`, usando los alias del binding. Si hay un hotkey disponible, se ejecuta una vez por cambio de escena. Si falta o falla, se aplican los parámetros configurados; si no hay respaldo, se usan los parámetros de `idle`. Los valores se limitan al rango que anuncia VTS y se refrescan cada 250 ms mientras esté despierta.

Los bindings iniciales usan entradas estándar verificadas y `akari.celebrate → Anim Shake`. En otros modelos solo se usan los parámetros anunciados por VTS. Los hotkeys de tipo toggle conservan el comportamiento de VTS: al configurar expresiones con ellos, configura también una acción de salida/restablecimiento en la escena siguiente.

`say` usa el lip-sync sintético del core y el alias `mouth`. `sleep` detiene los frames, retira los props e ignora eventos, incluida la voz. La escena de sueño puede ejecutar un hotkey configurado; sin ese hotkey, VTS recupera su tracking normal al dejar de recibir parámetros. `wake` vuelve a idle.

## Props

Los archivos se leen desde el proyecto y se envían como `customDataBase64`; no se copian archivos a la instalación de VTS. Solo se aceptan PNG, JPG o GIF menores de 5 MiB. VTS valida además las dimensiones y el contenido (64–2048 píxeles por dimensión para imágenes).

Se necesita el permiso **LoadCustomImagesAsItems**. Sin él, se omiten los props con un aviso. Para solicitarlo, configura `VTS_REQUEST_ITEM_PERMISSION=true` en `.env`, reinicia el bridge y acepta el popup de VTS. No es necesario mantenerlo en true después de concederlo.

Los props se cargan por id de `assets.json` y se retiran por el ID de su instancia. El adapter solo descarga sus propias instancias, no los items del usuario. VTS también los retira al desconectar el plugin. Un recurso ausente, rechazado o de tipo futuro se omite; se puede volver a intentar al recibir otro estado o recargar la configuración.

## Validación y alcance

`npm test` incluye un servidor WebSocket local que simula VTS: autenticación, correlación de respuestas, timeouts, reconexión, cambios de modelo, hotkeys, parámetros, permisos y carga/retirada de props. Las pruebas no requieren el VTS real ni usan su token.

Este paso no implementa el doctor (Paso 4), los clientes/CLI (Paso 5), la demo (Paso 6) ni el control de procesos. `deep_sleep` por ahora pausa a Alba y avisa que el cierre de VTS no está implementado. El adapter declara `processControl: false`.

Referencia del protocolo: [API oficial de VTube Studio](https://github.com/DenchiSoft/VTubeStudio), [permisos](https://github.com/DenchiSoft/VTubeStudio/tree/master/Permissions).