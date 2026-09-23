# Plan de ejecución — Reto SuperBrix (24 horas)

## Mapeo directo a la rúbrica

| Criterio (peso) | Cómo lo cubrimos |
|---|---|
| Facilidad y rapidez para el operario (25%) | App con botones grandes de 1 toque para Inicio/Setup/Pausa + un solo campo de texto (con dictado por voz nativo del teclado Android) para novedades. Sin formularios largos. |
| Uso de la IA (25%) | Apps Script llama a Groq para clasificar el texto libre en las 6 categorías oficiales del reto. Fallback local por palabras clave si la API falla, para no perder la demo. |
| Tablero de analítica (25%) | Looker Studio conectado en vivo a la Google Sheet: distribución de tiempo, Pareto de causas, filtros por operario/máquina/OP, alertas de cuellos de botella. |
| Integración funcional con Google (15%) | Google Sheets como base de datos, Apps Script como API, Looker Studio como visualización. Todo Google Workspace, cero servidores propios. |
| Claridad de la presentación (10%) | Diagrama antes/después + guion de pitch de 5 min (ver `docs/PITCH.md`). |

## Cronograma sugerido para 24 horas (equipo de 3)

| Bloque | Horas | Quién | Qué |
|---|---|---|---|
| 1. Setup | 0–2h | Los 3 | Crear el Sheet, pegar `Code.gs`, conseguir la API key de Groq y correr la app en el emulador. |
| 2. Backend + IA | 2–6h | Persona A | Probar clasificación con casos reales del PDF (frases de ejemplo), ajustar prompt, afinar fallback por palabras clave. |
| 3. App móvil | 2–8h | Persona B | Pantalla de captura, persistencia de Operario/OP/Máquina, conexión a la API, feedback visual de la categoría devuelta. |
| 4. Dashboard | 4–10h | Persona C | Looker Studio: los 4 widgets obligatorios + filtros. Cargar datos de prueba generando ~30 eventos variados. |
| 5. Integración y pruebas | 10–14h | Los 3 | Probar el flujo completo de punta a punta, casos borde (sin internet → fallback, texto ambiguo, etc.). |
| 6. Diagrama + pitch | 14–18h | Los 3 | Diagrama antes/después (`docs/proceso-diagrama.svg`), guion y ensayo del pitch de 5 min. |
| 7. Buffer / pulido | 18–22h | Los 3 | Pulir UI, revisar rúbrica punto por punto, grabar respaldo en video por si falla el wifi en vivo. |
| 8. Descanso / logística | 22–24h | Los 3 | Dormir por turnos, cargar equipos, llegar con margen. |

## Datos de prueba recomendados (para poblar el dashboard antes de la demo)

Usa el `curl` de `backend/apps-script/README.md` para insertar ~20-30 filas
variadas (varios operarios, máquinas, OPs y categorías) ANTES de la demo, así
el dashboard no se ve vacío cuando lo abras frente al jurado. En vivo, agrega
2-3 eventos nuevos desde el celular para mostrar la actualización en tiempo real.

## Riesgos y mitigación

- **Sin wifi/datos en el venue** → el fallback local por palabras clave permite
  seguir la demo completa aunque Groq no esté disponible.
- **Looker Studio tarda en refrescar** → tener lista una captura de pantalla
  reciente como respaldo, y refrescar manualmente justo antes de mostrar.
- **Emulador de Android lento el día de la demo** → probar también en un
  celular físico por USB (`react-native run-android --deviceId=...`) como plan B.
