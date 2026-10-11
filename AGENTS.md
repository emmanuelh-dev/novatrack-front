# NovaTrack / Anaconda GPS

## Fuente de verdad

- Los acuerdos compartidos de diseño, Ponytail, seguridad de pruebas, progreso y despliegue viven en [AGENTS.md del backend](../anaconda-traccar/AGENTS.md). Leerlo antes de trabajar; no duplicar esa política aquí.
- En este servidor: `/root/anaconda-traccar/AGENTS.md`. En otra máquina, localizar la copia de `anaconda-traccar`; si no está disponible, obtener esas instrucciones antes de tomar decisiones sobre producción.
- Este frontend es `/root/novatrack-front`; la copia local del usuario está en `/Users/emmanuel/Documents/GitHub/novatrack-front`. No implementar seguimiento en `traccar-web` ni en `anaconda-tracking`.

## Convenciones locales

- Respetar `.editorconfig`, `eslint.config.js`, `.prettierrc.json`, el tema y los patrones existentes de Traccar.
- Validación de código: `npm run lint` y `npm run build`. Pruebas: `scripts/check-main-screen.mjs` y `scripts/check-app-ui.mjs`, con API/WebSocket sintéticos; reproducción y límites en la documentación del backend.
- Este servidor es producción: el proxy de `vite.config.js` apunta al servicio real. No usarlo para pruebas sobre datos reales; limpiar los recursos temporales propios al terminar.
- No desplegar sin solicitud explícita; consultar las rutas, alcance, respaldo y verificaciones en el archivo canónico.
