# Cómo correr la app SuperBrixApp en Android Studio

El proyecto ya está generado en esta carpeta con React Native + TypeScript.
No necesitas crear nada a mano en Android Studio: solo abrir la carpeta `android/`.

## 1. Requisitos ya verificados en esta máquina

- Node v24.14.0 ✅
- Java 21 ✅
- Android SDK instalado en `%LOCALAPPDATA%\Android\Sdk` ✅

Falta confirmar que la variable de entorno `ANDROID_HOME` esté configurada.
Si no lo está, en PowerShell (una sola vez, como usuario):

```powershell
[System.Environment]::SetEnvironmentVariable('ANDROID_HOME', "$env:LOCALAPPDATA\Android\Sdk", 'User')
[System.Environment]::SetEnvironmentVariable('Path', "$env:Path;$env:LOCALAPPDATA\Android\Sdk\platform-tools", 'User')
```

Cierra y vuelve a abrir la terminal/Android Studio después de esto.

## 2. Abrir un emulador (o conectar un celular)

**Opción A — Emulador:**
1. Abre Android Studio → `More Actions` → `Virtual Device Manager`.
2. Si no tienes uno, crea un dispositivo (Pixel 6, API 34 recomendado).
3. Dale ▶ Play para encenderlo. Déjalo abierto.

**Opción B — Celular físico (recomendado para la demo real, la voz funciona mejor):**
1. En el celular: Ajustes → Acerca del teléfono → toca 7 veces "Número de compilación" para activar Opciones de desarrollador.
2. Ajustes → Opciones de desarrollador → activa "Depuración USB".
3. Conecta el celular por USB al PC y acepta el permiso de depuración en la pantalla del celular.

## 3. Correr la app

Desde esta carpeta (`SuperBrixApp/`), en dos terminales:

```bash
npm run android
```

Esto compila e instala la app en el emulador/celular. La primera vez puede
tardar varios minutos (descarga de Gradle). Metro (el bundler de JS) se abre
automáticamente en otra ventana; si no, corre `npm start` en una segunda
terminal.

## 4. Conectar la app al backend

1. Sigue `backend/apps-script/README.md` para desplegar el Apps Script y
   obtener la URL `/exec`.
2. Pega esa URL en [`src/api.ts`](../src/api.ts), constante `API_URL`.
3. Guarda, y en el celular/emulador sacude el dispositivo o presiona `R` dos
   veces en la ventana de Metro para recargar la app (o vuelve a correr
   `npm run android`).

## 5. Probar el flujo completo

1. Abre la app → ingresa cédula y nombre (se guarda localmente, no lo vuelves
   a pedir).
2. Escribe una OP# (ej. `62611`) → toca "▶ Producción Activa". Debe aparecer
   el cronómetro corriendo.
3. Toca "🎤 Pausar / reportar novedad" → escribe o dicta (usa el micrófono del
   teclado) algo como *"Paré la fresadora porque estoy esperando la broca de
   1/2 pulgada"* → Enviar.
4. Debe salir una alerta con la categoría que asignó la IA, y debe aparecer
   una fila nueva en el Google Sheet.
5. Toca "✅ Finalizar OP" para cerrar el ciclo.

## Problemas comunes

- **`SDK location not found`** → falta `ANDROID_HOME` (ver paso 1), o crea
  `android/local.properties` con la línea `sdk.dir=C:\\Users\\Aprendiz\\AppData\\Local\\Android\\Sdk`.
- **La app no conecta al backend / "Network request failed"** → revisa que
  `API_URL` en `src/api.ts` sea la URL `/exec` completa y que el despliegue de
  Apps Script tenga acceso "Cualquier usuario".
- **El emulador va muy lento** → usa un celular físico por USB (Opción B).
