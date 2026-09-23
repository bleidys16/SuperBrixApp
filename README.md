# SuperBrix

App móvil + backend para digitalizar el control de tiempos de taller: el
operario reporta en 1-2 toques (o por voz) qué está pasando en su máquina, una
IA clasifica la causa de cualquier interrupción, y todo queda en una Google
Sheet lista para un dashboard de Looker Studio. Construido para el reto de
innovación y digitalización industrial (bootcamp, 24 horas).

## Qué resuelve

En muchos talleres el tiempo perdido (esperas, fallas, setup) no se mide, o se
mide en papel al final del turno — para entonces nadie recuerda los detalles.
SuperBrix captura el evento en el momento, sin formularios largos, y usa IA
para no obligar al operario a elegir manualmente entre categorías técnicas.

## Cómo funciona

1. El operario abre la app, ingresa su cédula/nombre (se recuerda en el
   celular) y elige OP# + máquina.
2. Toca **Iniciar Producción Activa**. Se activa un cronómetro.
3. Cuando algo lo detiene, toca **Pausar / reportar novedad** y dicta o
   escribe en lenguaje natural qué pasó (ej. *"paré la fresadora porque estoy
   esperando la broca de 1/2 pulgada"*).
4. El backend (Google Apps Script) manda ese texto a un modelo de IA (Groq,
   con NVIDIA NIM como respaldo automático si Groq falla) que lo clasifica en
   una de las categorías oficiales del reto, y guarda la fila en un Google
   Sheet.
5. Looker Studio, conectado en vivo a esa hoja, arma el Pareto de causas y los
   demás widgets del dashboard.

### Modo sensor (beta)

Además del flujo manual, la app puede usar el acelerómetro real del celular
(módulo nativo propio, sin librerías de terceros) para detectar automáticamente
cuándo una máquina empieza o deja de vibrar, y disparar el inicio/la pregunta
de causa sin que el operario tenga que tocar nada. Pensado como demostración
de hacia dónde puede escalar el proyecto (ver "Visión Fase 2" abajo).

## Stack

- **App**: React Native 0.87 + TypeScript (CLI nativo, sin Expo).
- **Backend**: Google Apps Script (`doPost`/`doGet`) sobre Google Sheets como
  base de datos.
- **IA**: Groq (primario, rápido) con NVIDIA NIM como fallback automático en
  paralelo; fallback final por palabras clave si ambas fallan.
- **Dashboard**: Looker Studio, conectado directo a la Sheet.
- **Sensor**: módulo nativo Android (Kotlin) propio para el acelerómetro,
  expuesto a JS vía `NativeEventEmitter`.

## Estructura del repo

```
App.tsx                        Entry point de la app
src/
  screens/                     LoginScreen, CapturaScreen
  components/                  BannerClasificacion, TextoModal
  hooks/useSensorVibracion.ts  Lógica de detección de vibración
  nativo/acelerometro.ts       Wrapper JS del módulo nativo
  api.ts                       Llamadas al backend
  storage.ts                   Persistencia local (AsyncStorage)
  theme.ts                     Colores, radios, espaciados de marca
  categorias.ts                Mapeo categoría → color
android/
  app/src/main/java/com/superbrix/app/
    AcelerometroModule.kt      Módulo nativo del acelerómetro
    AcelerometroPackage.kt     Registro del módulo en React Native
backend/apps-script/
  Code.gs                      API (doPost/doGet), clasificación IA, dedup
  README.md                    Cómo desplegar el backend
docs/
  EJECUTAR.md                  Guía paso a paso para correr la app localmente
  PLAN.md                      Plan de ejecución del reto (24h) y mapeo a rúbrica
  DASHBOARD_LOOKER.md          Cómo armar el dashboard en Looker Studio
  sensor-demo.html             Demo web standalone del algoritmo de vibración
  vision-cierre-lazo.svg       Diagrama de la visión Fase 2
```

## Cómo correr el proyecto

Ver la guía completa en [`docs/EJECUTAR.md`](docs/EJECUTAR.md). Resumen:

```bash
npm install
npm run android   # con un emulador o celular conectado por USB
```

Para conectar la app al backend, desplegar primero Apps Script siguiendo
[`backend/apps-script/README.md`](backend/apps-script/README.md) y pegar la
URL `/exec` resultante en `API_URL` dentro de [`src/api.ts`](src/api.ts).

## Visión Fase 2: más allá del reporte manual

La app ya prueba que se puede detectar automáticamente si una máquina está
funcionando o parada (vía el acelerómetro). El siguiente paso natural es llevar
esa misma idea a nivel de máquina/estación (cámaras o sensores fijos en vez de
un celular), para que el estado de cada puesto se actualice solo y el operario
solo tenga que responder "¿por qué?" cuando de verdad hace falta. La idea se
enmarca como **medición de proceso, no vigilancia de personas** (relevante
bajo la Ley 1581 de 2012 de protección de datos en Colombia). Ver el diagrama
en [`docs/vision-cierre-lazo.svg`](docs/vision-cierre-lazo.svg).
