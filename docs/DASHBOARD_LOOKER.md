# Dashboard en Looker Studio

## 0. Cómo leer la hoja "Registros"

Columnas: `Fecha_Hora | Cedula | Nombre_Empleado | OP | Tipo_Evento | Descripcion_OP | Categoria_IA | Confianza | Horas_Segmento`.

Cada fila es **un solo segmento**, nunca dos cosas mezcladas:

- `Tipo_Evento = "Cierre"` → esa fila SÍ tiene `Horas_Segmento` con valor (las horas que duró esa categoría). `Descripcion_OP` va vacía.
- `Tipo_Evento = "Inicio"` → esa fila tiene la `Categoria_IA` y `Descripcion_OP` del segmento que empieza, pero `Horas_Segmento` va vacía (todavía no ha corrido tiempo; se sabrá cuando ese segmento se cierre más adelante, en OTRA fila).

**Por eso, para cualquier gráfico o suma de tiempo, siempre filtra `Tipo_Evento = "Cierre"`.** Si mezclas filas de "Inicio", vas a contar motivos de interrupción sin su duración real (huecos) o vas a duplicar el conteo.

## 1. Conectar la fuente de datos

1. Ve a https://lookerstudio.google.com → **Crear** → **Fuente de datos**.
2. Conector: **Hojas de cálculo de Google** → selecciona `SuperBrix-Registros`
   → pestaña `Registros`.
3. Verifica los tipos de campo:
   - `Fecha_Hora` → Fecha y hora
   - `Cedula`, `Nombre_Empleado`, `OP`, `Tipo_Evento`, `Categoria_IA`, `Confianza`, `Descripcion_OP` → Texto
   - `Horas_Segmento` → Número
4. Crea un campo calculado `Es_Produccion_Activa` (booleano), útil para el
   widget de distribución de tiempo:
   `CASE WHEN Categoria_IA = "Producción Activa" THEN 1 ELSE 0 END`

## 2. Widgets obligatorios (mapean directo a la rúbrica, sección 4.2)

En **todos** los widgets de esta tabla, agrega el filtro `Tipo_Evento = Cierre` (Looker Studio: panel derecho → Filtro → "Tipo_Evento es igual a Cierre").

| Widget | Tipo | Configuración |
|---|---|---|
| Distribución de tiempo | Gráfico circular o barras 100% apiladas | Dimensión: `Categoria_IA` (o el campo calculado Producción Activa vs. resto). Métrica: **SUM(Horas_Segmento)**, no conteo. |
| Causas de pérdida de tiempo | Gráfico de barras ordenado (Pareto) | Dimensión: `Categoria_IA` (excluyendo Producción Activa). Métrica: **SUM(Horas_Segmento)**. Ordenar descendente. |
| Filtro dinámico | Controles de filtro | Uno por `Nombre_Empleado`, uno por `OP`. (Si más adelante agregan máquina, agrégalo aquí también.) |
| Alertas / cuellos de botella | Tabla con formato condicional o Scorecard | Resalta cuando SUM(Horas_Segmento) de "Espera de Materiales" o "Falla Técnica" para una OP/operario supera un umbral (ej. > 1 hora en el turno). |
| Línea de tiempo | Serie de tiempo | Eje X: `Fecha_Hora` (por hora), Métrica: SUM(Horas_Segmento), para ver cuándo se concentran los paros. |

## 3. Tip para la demo en vivo

Configura el refresco de datos del informe en **cada 15 minutos** (o usa
"Actualizar" manual justo antes de mostrar el reporte de la app) para que el
jurado vea el punto que acabas de capturar aparecer en el tablero. Como cada
acción genera una fila de "Cierre" con horas ya calculadas, el refresco no
necesita ningún procesamiento extra.

## 4. Alternativa sin Looker Studio

Si el tiempo aprieta, puedes cumplir el mismo criterio con Google Sheets solo:
una hoja `Dashboard` con `QUERY()`/`SUMIFS()` (filtrando `Tipo_Evento="Cierre"`)
+ gráficos nativos de Sheets apuntando a `Registros`, y **Filtros de tabla
dinámica** para el filtrado por operario/OP. Es válido según la regla 3
(Sheets está en la lista de herramientas permitidas), pero Looker Studio se ve
más profesional en el pitch.
