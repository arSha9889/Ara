import { StyleSheet } from 'react-native';

export const colors = {
  canvas: '#0A111C',
  canvasMuted: '#101A29',
  surface: '#141F30',
  surfaceRaised: '#1A273A',
  surfacePressed: '#22334A',
  glass: 'rgba(21, 32, 49, 0.92)',
  glassStrong: 'rgba(27, 41, 61, 0.97)',
  glassBorder: '#2A3B53',
  divider: '#24344A',
  text: '#F3F7FC',
  textMuted: '#B0BECF',
  textFaint: '#8293A9',
  primary: '#8CC9FF',
  primaryStrong: '#4AA8F0',
  primaryPressed: '#318FD6',
  purple: '#B2A9FF',
  success: '#74D6A4',
  danger: '#FF9CAD',
  input: '#0E1928',
};

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
};

export const sharedStyles = StyleSheet.create({
  glassCard: {
    backgroundColor: colors.surface,
    borderColor: colors.glassBorder,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  elevatedCard: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.glassBorder,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  glassPanel: {
    backgroundColor: colors.glass,
    borderColor: colors.glassBorder,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.15,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.45,
  },
  body: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 23,
  },
});
