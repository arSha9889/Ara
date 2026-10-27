import { StyleSheet } from 'react-native';

export type ThemeMode = 'light' | 'dark';
export type ThemePreference = ThemeMode | 'system';

const lightColors = {
  canvas: '#F5F6EF',
  canvasMuted: '#EAEDDE',
  surface: '#FFFFFF',
  surfaceRaised: '#FAFBF5',
  surfacePressed: '#E9ECD9',
  input: '#F0F3E6',
  inputPressed: '#E6EAD8',
  glass: 'rgba(250, 251, 245, 0.94)',
  glassStrong: '#FAFBF5',
  overlay: 'rgba(9, 12, 7, 0.54)',
  mediaOverlay: 'rgba(9, 12, 7, 0.82)',
  mediaOverlayBorder: 'rgba(243, 247, 252, 0.16)',
  mediaViewer: 'rgba(9, 12, 7, 0.96)',
  shadow: 'rgba(15, 20, 9, 0.13)',
  callOverlayPrimaryGlow: 'rgba(199, 247, 46, 0.16)',
  callOverlaySecondaryGlow: 'rgba(142, 179, 34, 0.10)',
  borderSubtle: '#D9DFBF',
  borderInteractive: '#A6B66E',
  borderStrong: '#748541',
  text: '#161A0C',
  textMuted: '#586246',
  textFaint: '#7A8468',
  accent: '#83A90E',
  accentPressed: '#668809',
  accentSubtle: '#E6F6AD',
  accentSelected: '#D9F18C',
  accentDisabled: '#B9D46D',
  onAccent: '#101406',
  onAccentSubtle: 'rgba(16, 20, 6, 0.14)',
  onAccentMuted: 'rgba(16, 20, 6, 0.72)',
  onAccentFaint: 'rgba(16, 20, 6, 0.62)',
  onMedia: '#FFFFFF',
  onMediaMuted: 'rgba(255, 255, 255, 0.78)',
  onMediaFaint: 'rgba(255, 255, 255, 0.68)',
  success: '#20794A',
  successSubtle: '#DAF0D9',
  danger: '#B73740',
  dangerSubtle: '#F8E2E0',
  warning: '#886200',
  warningSubtle: '#F9EDC5',
  deliveryRead: '#6D920B',
  avatar: '#E7EFC9',
  avatarBorder: '#C5D789',
  divider: '#DDE3C7',
  glassBorder: '#D9DFBF',
  primary: '#83A90E',
  primaryStrong: '#83A90E',
  primaryPressed: '#668809',
  purple: '#667C31',
} as const;

const darkColors = {
  canvas: '#090C08',
  canvasMuted: '#10150D',
  surface: '#151B12',
  surfaceRaised: '#1B2317',
  surfacePressed: '#27321F',
  input: '#10150E',
  inputPressed: '#1C2517',
  glass: 'rgba(21, 27, 18, 0.94)',
  glassStrong: '#1B2317',
  overlay: 'rgba(0, 0, 0, 0.74)',
  mediaOverlay: 'rgba(7, 10, 6, 0.84)',
  mediaOverlayBorder: 'rgba(239, 250, 206, 0.14)',
  mediaViewer: 'rgba(6, 9, 5, 0.97)',
  shadow: 'rgba(0, 0, 0, 0.52)',
  callOverlayPrimaryGlow: 'rgba(202, 247, 53, 0.14)',
  callOverlaySecondaryGlow: 'rgba(120, 154, 27, 0.12)',
  borderSubtle: '#313D2A',
  borderInteractive: '#697D42',
  borderStrong: '#94AE57',
  text: '#F4F8E8',
  textMuted: '#B7C1A7',
  textFaint: '#849077',
  accent: '#C7F72E',
  accentPressed: '#D6FA61',
  accentSubtle: 'rgba(199, 247, 46, 0.15)',
  accentSelected: 'rgba(199, 247, 46, 0.23)',
  accentDisabled: 'rgba(199, 247, 46, 0.34)',
  onAccent: '#111707',
  onAccentSubtle: 'rgba(17, 23, 7, 0.16)',
  onAccentMuted: 'rgba(17, 23, 7, 0.70)',
  onAccentFaint: 'rgba(17, 23, 7, 0.58)',
  onMedia: '#FFFFFF',
  onMediaMuted: 'rgba(255, 255, 255, 0.78)',
  onMediaFaint: 'rgba(255, 255, 255, 0.68)',
  success: '#A9E78E',
  successSubtle: 'rgba(169, 231, 142, 0.14)',
  danger: '#FF9A95',
  dangerSubtle: 'rgba(255, 154, 149, 0.14)',
  warning: '#F4D26B',
  warningSubtle: 'rgba(244, 210, 107, 0.15)',
  deliveryRead: '#C7F72E',
  avatar: '#27331F',
  avatarBorder: '#4A5E35',
  divider: '#2B3525',
  glassBorder: '#384430',
  primary: '#C7F72E',
  primaryStrong: '#C7F72E',
  primaryPressed: '#D6FA61',
  purple: '#C3D789',
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
  control: 16,
  card: 20,
  sheet: 28,
  pill: 999,
} as const;

export const motion = {
  pressOpacity: 0.78,
  quick: 140,
  standard: 220,
  sheetOffset: 24,
  photoScaleFrom: 0.96,
} as const;

export function createSharedStyles(themeColors: AppColors) {
  return StyleSheet.create({
    glassCard: {
      backgroundColor: themeColors.surface,
      borderColor: themeColors.borderSubtle,
      borderRadius: radii.card,
      borderWidth: StyleSheet.hairlineWidth,
    },
    elevatedCard: {
      backgroundColor: themeColors.surfaceRaised,
      borderColor: themeColors.borderSubtle,
      borderRadius: radii.card,
      borderWidth: StyleSheet.hairlineWidth,
      elevation: 1,
      shadowColor: themeColors.shadow,
      shadowOffset: { height: 3, width: 0 },
      shadowOpacity: 0.16,
      shadowRadius: 10,
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
      fontWeight: '700',
      letterSpacing: 0.45,
    },
    title: {
      color: themeColors.text,
      fontSize: 30,
      fontWeight: '700',
      letterSpacing: -0.7,
    },
    body: {
      color: themeColors.textMuted,
      fontSize: 16,
      lineHeight: 23,
    },
  });
}

export const sharedStyles = createSharedStyles(colors);
