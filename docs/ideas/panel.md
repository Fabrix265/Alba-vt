# Idea: panel de control de Alba

> **Estado: idea en diseño, sin código.** Este documento describe qué podría ser
> el panel para decidirlo antes de implementarlo. Nada de esto existe todavía.

## El problema

Hoy todo se maneja desde la terminal y editando archivos: cambiar de modo exige
editar `.env` y reiniciar, lanzar una expresión exige `npm run alba -- <frase>`, y
saber si opencode está conectado exige `alba status`. Es cómodo para quien
programa, pero no para usar a Alba en el día a día ni para alguien que la
instale por primera vez.

## La idea

Una ventanita propia de Alba, abierta desde el icono de la bandeja (el mismo que
ya tiene la ventana PNGTuber) o con un comando, que permita **manejarla sin
terminal**.

### Lo que mostraría (primera versión)

| Sección | Contenido |
|---|---|
| **Estado** | Encendida / dormida, escena actual, modo (VTuber / PNGTuber) |
| **Conexión** | Si VTS o la ventana están conectados; qué agentes enviaron eventos y hace cuánto (lo mismo que `alba status`) |
| **Acciones rápidas** | Un botón por cada comando de `commands.json` (saludar, dormir, despertar, reset…) |
| **Modo** | Selector VTuber / PNGTuber, con el reinicio del bridge hecho por el panel |

### Lo que podría venir después

- Lista de expresiones con vista previa del clip (PNGTuber) o nombre del hotkey (VTuber).
- Probar una reacción sin esperar a que el agente la provoque.
- Ajustes simples sin editar JSON: tamaño de la ventana, cuánto reacciona
  (cooldowns), activar o desactivar reglas.
- Resultado de `doctor` con botones de "arreglar" cuando sea posible.
- Registro de los últimos eventos (solo tipo y herramienta, nunca contenido).

## Decisiones abiertas

### 1. ¿Ventana propia o página web?

**Propuesta: ventana propia (Electron).** El bridge rechaza a propósito cualquier
petición que venga de un navegador (cabecera `Origin`) para que ninguna página
web pueda controlar a Alba. Una página web en `localhost` chocaría con esa regla
de seguridad. Electron ya está en el proyecto para la ventana PNGTuber, así que
no hace falta añadir dependencias.

### 2. ¿Cómo cambiar de modo?

El modo se elige al arrancar el bridge (`ALBA_ADAPTER`). Dos caminos:

| Opción | Cómo | Ventaja | Coste |
|---|---|---|---|
| **A. Reinicio guiado** | El panel guarda el modo en `.env` y reinicia el bridge | Poco código; el core no cambia | Se corta la conexión 1–2 s |
| **B. Cambio en vivo** | El bridge desconecta un adapter y conecta otro sin reiniciarse | Sin cortes | Cambia la arquitectura: hoy el adapter es fijo durante toda la ejecución |

**Propuesta: empezar por A.** B es un cambio de arquitectura y, según
`AGENTS.md`, hay que acordarlo antes.

### 3. ¿Quién arranca a quién?

Hoy el bridge abre la ventana PNGTuber. Con un panel, quizá tenga más sentido que
el **panel** sea lo primero que se abre y arranque el bridge. Esto encaja con la
fase de instalación (un acceso directo que abre el panel). Arrancar y cerrar
procesos requiere aprobación explícita según `AGENTS.md`.

### 4. Seguridad

- El panel habla con el bridge como cualquier cliente: `127.0.0.1`, token de
  `.env`, sin `Origin`.
- Editar `.env` desde el panel solo para claves conocidas (`ALBA_ADAPTER`,
  `ALBA_PET_*`), nunca mostrar tokens.
- `deep_sleep` y cualquier operación que cierre procesos siguen pidiendo
  confirmación.

### 5. ¿Lógica en el panel?

No. Igual que los plugins, el panel es **tonto**: muestra `/state`, envía
`/intent` y edita configuración. El comportamiento sigue en `config/`.

## Esbozo

```
┌─ Alba ───────────────────────────── ● conectada ─┐
│  Modo:  ( ) VTuber   (•) PNGTuber     [Aplicar]   │
│  Escena: coding          Despierta                │
│                                                   │
│  Agentes                                          │
│   opencode   41 eventos · último hace 3 s         │
│   mcp         2 eventos · último hace 5 min       │
│                                                   │
│  Acciones                                         │
│  [hello] [focus] [tea time] [reset]               │
│  [good night] [ring ring]                         │
│                                                   │
│  [Diagnóstico]                    [Abrir config]  │
└───────────────────────────────────────────────────┘
```

## Pasos sugeridos

1. Acordar las decisiones abiertas de arriba.
2. Versión de solo lectura: estado, conexión y agentes.
3. Acciones rápidas (botones de `commands.json`).
4. Cambio de modo con reinicio guiado.
5. Integrarlo con el instalador (acceso directo al panel).
