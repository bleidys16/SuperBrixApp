# SuperBrix

App móvil Android + backend para digitalizar el control de tiempos de taller: el operario reporta en 1-2 toques (o por voz) qué está pasando en su máquina, una IA clasifica la causa de cualquier interrupción, y todo queda en una Google Sheet lista para un dashboard de Looker Studio. Construido para el reto de innovación y digitalización industrial (bootcamp, 24 horas) — **🥈 Proyecto Ganador del 2.° Lugar**.

## Qué resuelve

En muchos talleres el tiempo perdido (esperas, fallas, setup) no se mide, o se mide en papel al final del turno — para entonces nadie recuerda los detalles. SuperBrix captura el evento en el momento, sin formularios largos, y usa IA para no obligar al operario a elegir manualmente entre categorías técnicas.

## Cómo funciona

1. El operario abre la app e ingresa su cédula y nombre (se recuerdan en el celular). Para la demo hay 3 perfiles de ejemplo que autocompletan el nombre.
2. Elige la **OP** (puede dictar el número por voz) y la **máquina**.
3. Toca **Iniciar Producción Activa**. Se activa un cronómetro.
4. Cuando algo lo detiene, toca **Pausar / reportar novedad** y dicta o escribe en lenguaje natural qué pasó (ej. *"paré la fresadora porque estoy esperando la broca de 1/2 pulgada"*). También hay botones rápidos por categoría si no quiere hablar.
5. El backend (Google Apps Script) manda ese texto a Groq para clasificarlo en una de las 7 categorías del reto. Si Groq no está disponible, usa un clasificador local por palabras clave, y guarda cada segmento en una fila de Google Sheets.
6. Al terminar, **Finalizar OP** cierra el segmento en curso. La pantalla de **Resumen operativo** muestra horas productivas vs. improductivas, eficiencia, número de paradas y la causa principal.
7. Looker Studio, conectado en vivo a la hoja, arma el Pareto de causas y los demás widgets del dashboard.

Los eventos se envían en segundo plano con reintentos; si no se pueden guardar, la app avisa y permite reintentar sin perder el registro.

## Instalación (APK)

Descarga el APK más reciente desde la sección **Releases** del repositorio e instálalo en un celular Android 7.0 o superior (minSdk 24). Puede que Android pida permitir la instalación desde fuentes desconocidas. La app necesita conexión a internet y permiso de micrófono (solo para dictar por voz).

## Stack

- **App**: React Native 0.87 + TypeScript (CLI nativo, sin Expo).
- **Voz**: módulo nativo propio en Kotlin (`VozModule`) sobre el reconocimiento de voz de Android, sin librerías de terceros.
- **Backend**: Google Apps Script (`doPost`/`doGet`) sobre Google Sheets como base de datos.
- **IA**: Groq como único proveedor remoto, con fallback local por palabras clave para mantener la operación disponible.
- **Dashboard**: Looker Studio, conectado directo a la Sheet.

## Estructura del repo

```
App.tsx                        Entry point de la app
src/
  screens/                     LoginScreen, CapturaScreen, ResumenScreen
  components/                  BannerClasificacion, TextoModal
  nativo/voz.ts                Wrapper JS del módulo nativo de voz
  utils/numeroVoz.ts           Convierte el número dictado a dígitos
  api.ts                       Llamadas al backend
  storage.ts                   Persistencia local (AsyncStorage)
  operariosDemo.ts             Perfiles de ejemplo para la demo
  theme.ts                     Colores, radios, espaciados de marca
  categorias.ts                Mapeo categoría → color
android/
  app/src/main/java/com/superbrix/app/
    VozModule.kt               Módulo nativo de dictado por voz
    VozPackage.kt              Registro del módulo nativo en React Native
backend/apps-script/
  Code.gs                      API (doPost/doGet), clasificación IA, dedup, resumen
  README.md                    Cómo desplegar el backend
docs/
  EJECUTAR.md                  Guía paso a paso para correr la app localmente
  PLAN.md                      Plan de ejecución del reto (24h) y mapeo a rúbrica
  DASHBOARD_LOOKER.md          Cómo armar el dashboard en Looker Studio
  proceso-diagrama.svg         Diagrama del proceso
```

## Cómo correr el proyecto

Ver la guía completa en [`docs/EJECUTAR.md`](docs/EJECUTAR.md). Resumen:

```bash
npm install
npm run android   # con un emulador o celular conectado por USB
```

Para conectar la app a tu propio backend, desplegar primero Apps Script siguiendo [`backend/apps-script/README.md`](backend/apps-script/README.md) y pegar la URL `/exec` resultante en `API_URL` dentro de [`src/api.ts`](src/api.ts).

Para generar el APK de release:

```bash
cd android
gradlew.bat assembleRelease   # en Mac o Linux: ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```
