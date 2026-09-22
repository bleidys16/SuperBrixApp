import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_OPERARIO = '@superbrix/operario';

export interface Operario {
  cedula: string;
  nombre: string;
}

export async function guardarOperario(operario: Operario): Promise<void> {
  await AsyncStorage.setItem(KEY_OPERARIO, JSON.stringify(operario));
}

export async function obtenerOperario(): Promise<Operario | null> {
  const raw = await AsyncStorage.getItem(KEY_OPERARIO);
  return raw ? JSON.parse(raw) : null;
}

export async function limpiarOperario(): Promise<void> {
  await AsyncStorage.removeItem(KEY_OPERARIO);
}
