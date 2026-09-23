import { NativeModules, Platform } from 'react-native';

/**
 * Envoltorio del módulo nativo propio (android/.../VozModule.kt).
 * Usa el servicio oficial RecognizerIntent de Android para invocar
 * el diálogo de Google Voice Typing en español sin librerías externas.
 */
const { VozModule } = NativeModules;

export async function vozDisponible(): Promise<boolean> {
  if (Platform.OS !== 'android' || !VozModule) {
    return false;
  }
  try {
    return await VozModule.esDisponible();
  } catch {
    return false;
  }
}

export async function dictarAudio(
  prompt = 'Di el número de la orden de producción',
): Promise<string> {
  if (!VozModule) {
    throw new Error(
      'El módulo nativo de voz no está disponible. Verifica que la app esté corriendo en Android.',
    );
  }
  return await VozModule.iniciarReconocimiento(prompt);
}
