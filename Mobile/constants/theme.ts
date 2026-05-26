import { Platform } from 'react-native';

/**
 * Tema visual unificado de JWF Mobile basado en Salesforce Lightning Design
 * System (SLDS 2). El sistema completo de tokens vive en el repo CRM
 * (`ProyectoCrm/DESIGN.md`); acá tenemos la paleta Salesforce Light, que es
 * el modo único en mobile (no hay multi-tema porque la app es chica y
 * monocliente).
 *
 * Cualquier color, radio o peso tipográfico nuevo en la app debe consumirse
 * desde acá. NO usar hex hardcodeado en pantallas — viola la regla 1 del
 * DESIGN.md (Reglas Generales OBLIGATORIAS).
 */

export const JWFTheme = {
  color: {
    bgApp: '#f4f6f9',
    bgCard: '#ffffff',
    bgCardHover: '#f9fafb',
    bgSubtle: '#f4f6f9',
    bgInput: '#ffffff',
    bgSidebar: '#032d60', // azul oscuro SLDS — actualmente sin uso (no hay sidebar)

    textPrimary: '#181818',
    textSecondary: '#444444',
    textMuted: '#706e6b',
    textDim: '#adadad',
    textInverse: '#ffffff',
    textLink: '#0176d3',

    borderDefault: '#e5e5e5',
    borderSubtle: '#f0f0f0',
    borderHover: '#c9c9c9',
    borderFocus: '#0176d3',

    accent: '#0176d3',
    accentHover: '#014486',
    accentBg: '#eef4ff',
    accentText: '#0176d3',

    success: '#2e844a',
    successBg: '#e6f5ec',
    danger: '#ba0517',
    dangerBg: '#fef0f0',
    warning: '#dd7a01',
    warningBg: '#fef4e8',
    info: '#0176d3',
    infoBg: '#eef4ff',
  },

  radius: {
    sm: 4,
    md: 6,
    lg: 8,
    xl: 12,
    full: 9999,
  },

  fontWeight: {
    normal: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    /// Salesforce signature: títulos hero en weight 300.
    heroLight: '300' as const,
  },

  /// Tracking para títulos hero (usado solo en encabezados grandes).
  titleTracking: -0.01,

  shadow: {
    sm: {
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowRadius: 2,
      shadowOffset: { width: 0, height: 2 },
      elevation: 1,
    },
    md: {
      shadowColor: '#000',
      shadowOpacity: 0.1,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 3,
    },
    lg: {
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
  },
};

/**
 * Compatibilidad con `useColorScheme()` y consumidores existentes (ej.
 * `app/(tabs)/_layout.tsx` lee Colors[colorScheme].tint).
 *
 * No tenemos modo dark distinto por ahora — los dos resuelven a la misma
 * paleta SF Light. Si en el futuro se agrega dark, replicar aquí.
 */
const tintColorLight = JWFTheme.color.accent;

export const Colors = {
  light: {
    text: JWFTheme.color.textPrimary,
    background: JWFTheme.color.bgApp,
    tint: tintColorLight,
    icon: JWFTheme.color.textMuted,
    tabIconDefault: JWFTheme.color.textMuted,
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: JWFTheme.color.textPrimary,
    background: JWFTheme.color.bgApp,
    tint: tintColorLight,
    icon: JWFTheme.color.textMuted,
    tabIconDefault: JWFTheme.color.textMuted,
    tabIconSelected: tintColorLight,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
