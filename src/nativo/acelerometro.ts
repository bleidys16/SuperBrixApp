import { NativeModules, NativeEventEmitter, EmitterSubscription } from 'react-native';

/**
 * Envoltorio del módulo nativo propio (android/.../AcelerometroModule.kt).
 * Se escribió a mano en vez de usar react-native-sensors porque esa
 * librería está abandonada (build.gradle roto + sin soporte arm64-v8a).
 * `AcelerometroModule` puede venir undefined en el entorno de test de Jest
 * (no hay puente nativo real ahí) o si por algún motivo no se linkeó bien;
 * todas las funciones de aquí lo manejan sin explotar en esos casos.
 */
const { AcelerometroModule } = NativeModules;
const emisor = AcelerometroModule ? new NativeEventEmitter(AcelerometroModule) : null;

export interface LecturaAcelerometro {
  x: number;
  y: number;
  z: number;
}

export function acelerometroDisponible(): boolean {
  return !!AcelerometroModule;
}

export function iniciarAcelerometro(): void {
  AcelerometroModule?.iniciar();
}

export function detenerAcelerometro(): void {
  AcelerometroModule?.detener();
}

export function suscribirAcelerometro(
  callback: (lectura: LecturaAcelerometro) => void,
): EmitterSubscription | null {
  if (!emisor) {
    return null;
  }
  // NativeEventEmitter tipa su listener como (...args: Object[]) por su API
  // genérica; aquí sabemos que este evento específico siempre trae x/y/z.
  return emisor.addListener('AcelerometroLectura', ((lectura: LecturaAcelerometro) =>
    callback(lectura)) as (...args: readonly object[]) => unknown);
}
