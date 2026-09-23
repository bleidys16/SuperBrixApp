/**
 * Identidad visual de SuperBrix: tema claro, naranja de marca exacto
 * (#EC8C2B, dado por la empresa) y colores de categoría reajustados para
 * que ninguno se confunda con el naranja de marca/acción.
 * Todas las pantallas importan de aquí en vez de repetir hex sueltos.
 */

export const COLOR = {
  // Marca
  brand: '#EC8C2B',
  brandDark: '#C96F1A', // presionado
  brandDarker: '#A65913',
  brandTint: '#FDEEDD', // fondo tenue con tinte de marca (chips activos suaves, halos)
  ink: '#1A1A1A', // negro carbón del wordmark del logo

  // Fondo — blanco real, como se pidió
  bg: '#FFFFFF',
  bgElevated: '#F7F5F1', // inputs, chips sin seleccionar
  surface: '#FFFFFF', // tarjetas (se distinguen por borde/sombra, no por relleno)
  surfaceAlt: '#F2EFE9',
  border: '#E7E2D8',
  borderStrong: '#D7CFC0',

  // Texto
  text: '#1A1A1A',
  textMuted: '#6B6558',
  textFaint: '#9C9585',

  // Semánticos (categorías/estados) — deliberadamente lejos del naranja de
  // marca en el círculo cromático, para que un estado nunca se confunda
  // con un botón de acción.
  success: '#2F9E52',
  successBg: '#E7F5EC',
  danger: '#D6483F',
  dangerBg: '#FBEAE8',
  warn: '#B8860B', // ámbar dorado, no naranja — distinto del brand a propósito
  warnBg: '#F6EEDA',
  info: '#3B82C4',
  infoBg: '#E8F1F9',
  violet: '#7C6FD1',
  violetBg: '#EEEBFA',
  neutralIcon: '#8A8071',
} as const;

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
} as const;

export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;
