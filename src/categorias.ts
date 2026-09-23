import { COLOR } from './theme';

/**
 * Color por categoría operativa, para que el operario (y el jurado en la
 * demo) identifique de un vistazo si el tiempo es productivo (verde) o una
 * interrupción (ámbar/rojo), sin tener que leer el texto completo.
 * Mismas 7 categorías que CATEGORIAS en backend/apps-script/Code.gs.
 * Nunca usan el naranja de marca (COLOR.brand): ese queda solo para
 * acciones y branding, así no se confunde con un estado.
 */
export const COLOR_CATEGORIA: Record<string, string> = {
  'Producción Activa': COLOR.success,
  'Alistamiento y Preparación (Setup)': COLOR.info,
  'Espera de Materiales / Logística': COLOR.warn,
  'Falla Técnica / Mantenimiento': COLOR.danger,
  'Calidad y Aprobación': COLOR.violet,
  'Instrucciones / Coordinación': COLOR.info,
  'Ausencia del Operario / Descanso': COLOR.neutralIcon,
};

export function colorCategoria(categoria: string): string {
  return COLOR_CATEGORIA[categoria] || COLOR.textMuted;
}
