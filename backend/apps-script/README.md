# Backend SuperBrix (Google Apps Script)

## 1. Crear la hoja base

1. Crea un Google Sheet nuevo, nómbralo `SuperBrix-Registros`.
2. En la hoja "Registros" (el script la crea sola en el primer POST, pero puedes
   crearla a mano con estas columnas en la fila 1):

   `Fecha_Hora | Cedula | Nombre_Empleado | OP | Tipo_Evento | Descripcion_OP | Categoria_IA | Confianza | Horas_Segmento | Maquina`

   Estas columnas son casi 1 a 1 con la tarjeta física actual `FO-A-MA-01
   Control de tiempos orden de producción` (Cédula, Nombre, OP#, Descripción
   de OP, No. de Horas): la app reemplaza el papel, y la IA agrega
   `Categoria_IA` automáticamente en vez de que alguien la calcule a mano.
   `Horas_Segmento` se calcula sola en el celular (diferencia de tiempo desde
   el evento anterior), reemplazando el cálculo manual de "No. de Horas".

   **Importante sobre `Tipo_Evento`:** cada fila es un solo segmento, nunca
   dos cosas mezcladas. `"Cierre"` = fila con `Horas_Segmento` lleno (el
   bloque que se terminó) y `Descripcion_OP` vacía. `"Inicio"` = fila con
   `Categoria_IA`/`Descripcion_OP` del bloque que empieza, con
   `Horas_Segmento` vacío (se llenará en su propia fila de "Cierre" más
   adelante). Por eso una sola acción del operario (ej. reportar una
   novedad) puede generar **dos filas**: una que cierra lo anterior y otra
   que abre lo nuevo. Para sumar tiempo por categoría en el dashboard,
   siempre filtra `Tipo_Evento = "Cierre"`.

## 2. Pegar el backend

1. En el Sheet: `Extensiones > Apps Script`.
2. Borra el contenido de `Code.gs` y pega el archivo `Code.gs` de esta carpeta.

## 3. Configurar las API keys de IA (Groq + NVIDIA como respaldo)

El backend prueba los proveedores en orden: **Groq primero, NVIDIA después,
y si ambos fallan, un clasificador por palabras clave** (nunca se cae del
todo). Cada uno se activa solo con tener su propiedad configurada; puedes
tener solo Groq, solo NVIDIA, o los dos.

### Groq (recomendado, el que usa la demo)

Groq corre modelos open source (Llama, Gemma, Mixtral) sobre hardware propio
(LPU), no sobre GPUs compartidas como NVIDIA NIM gratis: responde típicamente
en **menos de 1 segundo**, sin la cola variable (2-40 s) que tiene NVIDIA.

1. Ve a https://console.groq.com → crea una cuenta gratis (con Google es
   inmediato) → **API Keys** → **Create API Key**. Copia la key (empieza
   con `gsk_`).
2. En el editor de Apps Script: ícono de engranaje (Configuración del
   proyecto) → **Propiedades del script** → Añadir propiedad:
   - Propiedad: `GROQ_API_KEY`
   - Valor: tu API key
3. El modelo por defecto es `llama-3.3-70b-versatile`. Si Groq cambia su
   catálogo, se puede sobreescribir sin tocar código con una propiedad
   `GROQ_MODEL` (ver https://console.groq.com/docs/models para los vigentes).

### NVIDIA (respaldo, opcional)

1. Ve a https://build.nvidia.com/nvidia/nemotron-3.5-lightning-30b-a3b (crea
   cuenta gratis si te la pide) y en la sección "Prototype" da clic en
   **Generate API Key**. Copia la key (empieza con `nvapi-`).
   - El endpoint gratis de NVIDIA es una cola compartida: puede tardar entre
     2 y 40+ segundos según la hora. Por eso va como respaldo detrás de Groq,
     no como principal.
2. Añade la propiedad `NVIDIA_API_KEY` igual que arriba.
3. El modelo por defecto es `nvidia/nemotron-3.5-lightning-30b-a3b` (los
   otros modelos "gratis" del catálogo de NVIDIA dieron 404/410 al probarlos
   con esta cuenta); se puede cambiar con una propiedad `NVIDIA_MODEL` sin
   tocar código. La función `compararModelosNVIDIA()` en el editor prueba
   varios candidatos y dice cuál responde.

### Si no configuras ninguna

El sistema no se cae: usa el clasificador de respaldo por palabras clave
(`clasificarPorPalabrasClave`) para no perder la demo. La columna `Confianza`
del Sheet dirá `baja (heurística sin IA)` en ese caso.

### Antes de la demo

Ejecuta `probarIA()` desde el editor: prueba TODOS los proveedores
configurados (no solo el primero) y dice cuánto tarda cada uno y si
clasifica bien, para confirmar que el respaldo también funciona por si Groq
llegara a fallar en pleno pitch.

## 4. Publicar como Web App

1. `Implementar > Nueva implementación`.
2. Tipo: **Aplicación web**.
3. Ejecutar como: **Yo**. Quién tiene acceso: **Cualquier usuario**.
4. Copia la URL que termina en `/exec`. Esa es la URL que va en la app móvil
   (`API_URL` en `src/api.ts`).
5. Cada vez que modifiques `Code.gs`, debes crear una **nueva versión** de la
   implementación (Implementar > Gestionar implementaciones > editar > Nueva versión)
   para que los cambios tomen efecto en la URL `/exec`.

## 5. Probar sin la app

Con `curl` o Postman (usa `--data`, no `-X POST -d` a secas, para que curl
siga bien la redirección de Apps Script en Windows/Git Bash):

Simular el inicio de una OP con botón rápido (sin IA, 1 fila "Inicio"):

```bash
curl -s -L "TU_URL_/exec" -H "Content-Type: application/json" --data "{\"cedula\":\"72234621\",\"nombre\":\"Juan Perez\",\"op\":\"62611\",\"maquina\":\"Fresadora CNC\",\"abreNuevoSegmento\":true,\"categoria\":\"Producción Activa\"}"
```

Simular una novedad en lenguaje libre que cierra ese segmento y abre uno
nuevo clasificado por la IA (2 filas: "Cierre" + "Inicio"):

```bash
curl -s -L "TU_URL_/exec" -H "Content-Type: application/json" --data "{\"cedula\":\"72234621\",\"nombre\":\"Juan Perez\",\"op\":\"62611\",\"maquina\":\"Fresadora CNC\",\"categoriaCerrada\":\"Producción Activa\",\"horasCerradas\":0.75,\"abreNuevoSegmento\":true,\"texto\":\"Pare la fresadora porque estoy esperando que traigan la broca de 1/2 pulgada\"}"
```

Simular "Finalizar OP" (solo cierra, 1 fila "Cierre", sin abrir nada nuevo):

```bash
curl -s -L "TU_URL_/exec" -H "Content-Type: application/json" --data "{\"cedula\":\"72234621\",\"nombre\":\"Juan Perez\",\"op\":\"62611\",\"maquina\":\"Fresadora CNC\",\"categoriaCerrada\":\"Espera de Materiales / Logística\",\"horasCerradas\":0.25,\"abreNuevoSegmento\":false}"
```

Deberías ver la(s) fila(s) nueva(s) en el Sheet y una respuesta JSON con la
`categoria` del segmento que quedó abierto (si abriste uno).
