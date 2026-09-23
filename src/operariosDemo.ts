import type { Operario } from './storage';

/**
 * Perfiles usados únicamente para la demostración y el pitch.
 * Sus nombres coinciden con los datos de ejemplo del backend/dashboard.
 * No representan credenciales reales ni reemplazan el ingreso manual.
 */
export const OPERARIOS_DEMO: readonly Operario[] = [
  { cedula: '72234621', nombre: 'Juan Perez' },
  { cedula: '1098765432', nombre: 'Maria Gomez' },
  { cedula: '1055667788', nombre: 'Laura Torres' },
];

export function buscarOperarioDemo(cedula: string): Operario | null {
  const normalizada = cedula.replace(/\D/g, '');
  return OPERARIOS_DEMO.find((operario) => operario.cedula === normalizada) || null;
}
