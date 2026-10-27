import { Platform } from 'react-native';

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

export const ANDON = {
  produccion: {
    bg: '#F0FDF4',
    border: '#22C55E',
    texto: '#15803D',
    badgeBg: '#DCFCE7',
    badgeTexto: '#166534',
    halo: 'rgba(34, 197, 94, 0.22)',
  },
  falla: {
    bg: '#FEF2F2',
    border: '#EF4444',
    texto: '#B91C1C',
    badgeBg: '#FEE2E2',
    badgeTexto: '#991B1B',
    halo: 'rgba(239, 68, 68, 0.22)',
  },
  material: {
    bg: '#FFFBEB',
    border: '#F59E0B',
    texto: '#B45309',
    badgeBg: '#FEF3C7',
    badgeTexto: '#92400E',
    halo: 'rgba(245, 158, 11, 0.22)',
  },
  setup: {
    bg: '#EFF6FF',
    border: '#3B82F6',
    texto: '#1D4ED8',
    badgeBg: '#DBEAFE',
    badgeTexto: '#1E40AF',
    halo: 'rgba(59, 130, 246, 0.22)',
  },
  pausa: {
    bg: '#F8FAFC',
    border: '#94A3B8',
    texto: '#475569',
    badgeBg: '#F1F5F9',
    badgeTexto: '#334155',
    halo: 'rgba(148, 163, 184, 0.22)',
  },
} as const;

export const FONT = {
  regular: Platform.select({ ios: 'Karla-Regular', android: 'Karla-Regular' }),
  medium: Platform.select({ ios: 'Karla-Medium', android: 'Karla-Medium' }),
  semiBold: Platform.select({ ios: 'Karla-SemiBold', android: 'Karla-SemiBold' }),
  bold: Platform.select({ ios: 'Karla-Bold', android: 'Karla-Bold' }),
  condensed: Platform.select({ ios: 'Karla-Bold', android: 'Karla-Bold' }),
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
