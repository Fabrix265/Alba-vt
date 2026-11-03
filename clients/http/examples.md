# HTTP local con curl

Arranca `npm start`. Todos los endpoints usan el puerto de `.env`, el header
`X-Alba-Token` y, en POST, `Content-Type: application/json`. No se aceptan
peticiones con Origin de navegador. Nunca publiques el valor de ALBA_TOKEN.

## PowerShell (desde la raiz del proyecto)

Este ejemplo lee solo puerto/token de `.env` usando el mismo lector del bridge.
El token se pasa a curl por stdin; no se imprime ni se escribe en otro archivo.

```powershell
$alba = node --input-type=module -e "import {readEnvironment} from './src/environment.mjs'; const e=readEnvironment(); console.log(JSON.stringify({port:e.ALBA_BRIDGE_PORT,token:e.ALBA_TOKEN}));" | ConvertFrom-Json
$albaHeaders = 'header = "X-Alba-Token: ' + $alba.token + '"'
$albaBase = 'http://127.0.0.1:' + $alba.port

$albaHeaders | curl.exe --fail-with-body --silent --show-error --config - "$albaBase/state"
$albaHeaders | curl.exe --fail-with-body --silent --show-error --config - --json '{\"source\":\"http\",\"type\":\"tool.start\",\"tool\":\"bash\"}' "$albaBase/event"
$albaHeaders | curl.exe --fail-with-body --silent --show-error --config - --json '{\"command\":\"good night\"}' "$albaBase/intent"
$albaHeaders | curl.exe --fail-with-body --silent --show-error --config - --json '{\"command\":\"ring ring\"}' "$albaBase/intent"
$albaHeaders | curl.exe --no-buffer --config - "$albaBase/stream"
```

El escape `\"` de esos JSON es para Windows PowerShell 5.1. En PowerShell 7.3+
con paso nativo de argumentos, usa comillas JSON normales dentro del literal
simple, por ejemplo `' {"command":"good night"} '` sin los espacios externos.

## Bash (con ALBA_BRIDGE_PORT y ALBA_TOKEN ya exportados localmente)

```bash
base="http://127.0.0.1:${ALBA_BRIDGE_PORT}"
printf 'header = "X-Alba-Token: %s"\n' "$ALBA_TOKEN" |
  curl --fail-with-body --silent --show-error --config - "$base/state"
printf 'header = "X-Alba-Token: %s"\n' "$ALBA_TOKEN" |
  curl --fail-with-body --silent --show-error --config - \
    --json '{"source":"http","type":"say","text":"Hola, estoy aqui"}' "$base/event"
printf 'header = "X-Alba-Token: %s"\n' "$ALBA_TOKEN" |
  curl --fail-with-body --silent --show-error --config - \
    --json '{"intent":"coding","props":["keyboard"]}' "$base/intent"
```

`GET /state` devuelve escena, capas, capacidades, inventario del adapter y comandos
vigentes. `POST /event` acepta eventos canonicos; `POST /intent` acepta una
intencion o una frase `command` resuelta por commands.json. `GET /stream` emite SSE.

Para deep_sleep se exige `confirmed: true` **solo tras la autorizacion explicita
del usuario para esa operacion**. Sin ello responde HTTP 409. Sin control de
procesos configurado, se pausa Alba y la respuesta explica que VTS sigue abierto.
Nunca pongas confirmaciones automaticas en el plugin o en rules.json.
