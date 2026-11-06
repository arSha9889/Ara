import { StyleSheet } from 'react-native';

export type ThemeMode = 'light' | 'dark';
export type ThemePreference = ThemeMode | 'system';

const lightColors = {
  canvas: '#F2F9F4',
  canvasMuted: '#E2F0E6',
  surface: '#FFFFFF',
  surfaceRaised: '#F8FCF9',
  surfacePressed: '#E4F2E8',
  input: '#EEF8F0',
  inputPressed: '#E0F0E4',
  glass: 'rgba(248, 252, 249, 0.92)',
  glassStrong: '#F8FCF9',
  overlay: 'rgba(1, 30, 16, 0.58)',
  mediaOverlay: 'rgba(1, 21, 11, 0.84)',
  mediaOverlayBorder: 'rgba(243, 247, 252, 0.16)',
  mediaViewer: 'rgba(9, 12, 7, 0.96)',
  shadow: 'rgba(1, 45, 24, 0.14)',
  callOverlayPrimaryGlow: 'rgba(0, 202, 101, 0.17)',
  callOverlaySecondaryGlow: 'rgba(0, 118, 57, 0.11)',
  borderSubtle: '#C9E4D0',
  borderInteractive: '#6CB884',
  borderStrong: '#398553',
  text: '#092315',
  textMuted: '#426653',
  textFaint: '#668674',
  accent: '#00B85C',
  accentPressed: '#009B4D',
  accentSubtle: '#D5F7E1',
  accentSelected: '#BCEFCF',
  accentDisabled: '#8ED1A8',
  onAccent: '#001E0E',
  onAccentSubtle: 'rgba(0, 30, 14, 0.14)',
  onAccentMuted: 'rgba(0, 30, 14, 0.72)',
  onAccentFaint: 'rgba(0, 30, 14, 0.62)',
  onMedia: '#FFFFFF',
  onMediaMuted: 'rgba(255, 255, 255, 0.78)',
  onMediaFaint: 'rgba(255, 255, 255, 0.68)',
  success: '#087D3A',
  successSubtle: '#D9F5E2',
  danger: '#B73740',
  dangerSubtle: '#F8E2E0',
  warning: '#8A5A00',
  warningSubtle: '#FBECCB',
  deliveryRead: '#009B4D',
  avatar: '#DDF5E5',
  avatarBorder: '#9EDAB0',
  divider: '#D6E9DB',
  glassBorder: '#C9E4D0',
  primary: '#00B85C',
  primaryStrong: '#00B85C',
  primaryPressed: '#009B4D',
  purple: '#21884B',
} as const;

const darkColors = {
  canvas: '#03140C',
  canvasMuted: '#061C11',
  surface: '#092218',
  surfaceRaised: '#0C2A1C',
  surfacePressed: '#123A26',
  input: '#071D13',
  inputPressed: '#0D2D1D',
  glass: 'rgba(7, 31, 20, 0.88)',
  glassStrong: '#0A2518',
  overlay: 'rgba(0, 0, 0, 0.74)',
  mediaOverlay: 'rgba(2, 20, 12, 0.86)',
  mediaOverlayBorder: 'rgba(199, 255, 221, 0.15)',
  mediaViewer: 'rgba(1, 13, 8, 0.98)',
  shadow: 'rgba(0, 0, 0, 0.52)',
  callOverlayPrimaryGlow: 'rgba(0, 222, 107, 0.18)',
  callOverlaySecondaryGlow: 'rgba(0, 129, 62, 0.14)',
  borderSubtle: '#185136',
  borderInteractive: '#297A50',
  borderStrong: '#4CC87A',
  text: '#F2FFF5',
  textMuted: '#B0CFBA',
  textFaint: '#7EA58B',
  accent: '#00D66B',
  accentPressed: '#23E784',
  accentSubtle: 'rgba(0, 214, 107, 0.16)',
  accentSelected: 'rgba(0, 214, 107, 0.25)',
  accentDisabled: 'rgba(0, 214, 107, 0.36)',
  onAccent: '#002A16',
  onAccentSubtle: 'rgba(0, 42, 22, 0.16)',
  onAccentMuted: 'rgba(0, 42, 22, 0.72)',
  onAccentFaint: 'rgba(0, 42, 22, 0.62)',
  onMedia: '#FFFFFF',
  onMediaMuted: 'rgba(255, 255, 255, 0.78)',
  onMediaFaint: 'rgba(255, 255, 255, 0.68)',
  success: '#57EE9C',
  successSubtle: 'rgba(87, 238, 156, 0.14)',
  danger: '#FF9A95',
  dangerSubtle: 'rgba(255, 154, 149, 0.14)',
  warning: '#FFD275',
  warningSubtle: 'rgba(255, 210, 117, 0.15)',
  deliveryRead: '#00D66B',
  avatar: '#123B28',
  avatarBorder: '#27794E',
  divider: '#123F29',
  glassBorder: '#205F3D',
  primary: '#00D66B',
  primaryStrong: '#00D66B',
  primaryPressed: '#23E784',
  purple: '#77E6A6',
} as const;

export type AppColors = { [Key in keyof typeof lightColors]: string };

export const themes: Record<ThemeMode, AppColors> = {
  light: lightColors,
  dark: darkColors,
};

// Compatibility palette for feature code that has not yet moved to useTheme.
// All new and shared AraShift UI must read the active semantic palette from ThemeProvider.
export const colors = themes.dark;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
  xxxl: 48,
} as const;

export const radii = {
  compact: 12,
  control: 18,
  card: 22,
  sheet: 28,
  pill: 999,
} as const;

export const motion = {
  pressOpacity: 0.78,
  quick: 140,
  standard: 260,
  sheetOffset: 24,
  photoScaleFrom: 0.96,
} as const;

export function createSharedStyles(themeColors: AppColors) {
  return StyleSheet.create({
    glassCard: {
      backgroundColor: themeColors.glass,
      borderColor: themeColors.glassBorder,
      borderRadius: radii.card,
      borderWidth: StyleSheet.hairlineWidth,
    },
    elevatedCard: {
      backgroundColor: themeColors.surfaceRaised,
      borderColor: themeColors.glassBorder,
      borderRadius: radii.card,
      borderWidth: StyleSheet.hairlineWidth,
      elevation: 3,
      shadowColor: themeColors.shadow,
      shadowOffset: { height: 3, width: 0 },
      shadowOpacity: 0.22,
      shadowRadius: 14,
    },
    glassPanel: {
      backgroundColor: themeColors.glass,
      borderColor: themeColors.borderSubtle,
      borderRadius: radii.card,
      borderWidth: StyleSheet.hairlineWidth,
    },
    eyebrow: {
      color: themeColors.accent,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.7,
    },
    title: {
      color: themeColors.text,
      fontSize: 29,
      fontWeight: '800',
      letterSpacing: -0.9,
    },
    body: {
      color: themeColors.textMuted,
      fontSize: 16,
      lineHeight: 23,
    },
  });
}

export const sharedStyles = createSharedStyles(colors);
