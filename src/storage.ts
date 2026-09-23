import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_OPERARIO = '@superbrix/operario';
const KEY_MAQUINA = '@superbrix/maquina';
const KEY_OPERARIOS_CONOCIDOS = '@superbrix/operarios_conocidos';

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

/** El operario casi siempre trabaja en la misma máquina: se recuerda la última. */
export async function guardarMaquina(maquina: string): Promise<void> {
  await AsyncStorage.setItem(KEY_MAQUINA, maquina);
}

export async function obtenerMaquina(): Promise<string> {
  return (await AsyncStorage.getItem(KEY_MAQUINA)) || '';
}

/**
 * Nombres que este mismo celular ya vio, por cédula. NO es una base de datos
 * de la empresa (no existe ese backend); solo evita que un operario que ya
 * usó este teléfono tenga que volver a escribir su nombre.
 */
async function obtenerOperariosConocidos(): Promise<Record<string, string>> {
  const raw = await AsyncStorage.getItem(KEY_OPERARIOS_CONOCIDOS);
  return raw ? JSON.parse(raw) : {};
}

export async function recordarOperario(operario: Operario): Promise<void> {
  const conocidos = await obtenerOperariosConocidos();
  conocidos[operario.cedula] = operario.nombre;
  await AsyncStorage.setItem(KEY_OPERARIOS_CONOCIDOS, JSON.stringify(conocidos));
}

export async function buscarNombrePorCedula(cedula: string): Promise<string | null> {
  const conocidos = await obtenerOperariosConocidos();
  return conocidos[cedula] || null;
}
