# Primeros pasos

De cero a ver a Alba reaccionando a tu agente. Para el detalle de cada parte
hay enlaces en cada paso.

## 1. Prepara el proyecto

Necesitas **Node.js 24 o superior** (`node --version`).

```powershell
npm install
Copy-Item .env.example .env
```

Abre `.env` y pon una clave larga e inventada en `ALBA_TOKEN`, por ejemplo
generada con:

```powershell
node -e "console.log(require('node:crypto').randomBytes(24).toString('hex'))"
```

Esa clave es la que usan opencode, la CLI y la ventana para hablar con Alba.
`.env` nunca se sube a git.

## 2. Elige el modo

En `.env`, `ALBA_ADAPTER`:

| Modo | Qué necesitas | Guía |
|---|---|---|
| `pngtuber` | Tus imágenes o videos en `assets/pngtuber/` (con uno basta: `idle`) | [Modo PNGTuber](pngtuber.md) |
| `vtuber` | VTube Studio con un modelo y *Allow Plugin API access* | [Adapter de VTube Studio](vts-adapter.md) |
| `fake` | Nada; no se ve nada, sirve para probar | — |

Cambiar de modo = editar esa línea y reiniciar `npm start`.

## 3. Diagnóstico

```powershell
npm run doctor
```

Arregla los `[ERROR]`. Los `[AVISO]` son opcionales. En modo VTuber, la primera
vez acepta el popup «Alba» en VTube Studio.

## 4. Arranca

```powershell
npm start
```

Déjala abierta. En modo PNGTuber se abre la ventana de Alba. En otra terminal:

```powershell
npm run demo
npm run alba -- hello
npm run alba -- list
```

## 5. Conecta opencode

Abre opencode **desde la carpeta de Alba**, pídele algo y comprueba:

```powershell
npm run alba -- status
```

Debe aparecer una línea `opencode`. Detalles en [Conectar opencode](opencode.md).

## 6. Hazla tuya

- [Crea tus propias cosas](customize.md): expresiones, reacciones y comandos.
- [Cómo probar Alba](testing.md): la lista completa de comprobaciones.
- [Referencia de configuración](config-reference.md): todos los campos.
