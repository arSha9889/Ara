import { StyleSheet } from 'react-native';

export const colors = {
  canvas: '#09121F',
  canvasMuted: '#101D2D',
  glass: 'rgba(20, 35, 55, 0.84)',
  glassStrong: 'rgba(29, 49, 75, 0.96)',
  glassBorder: 'rgba(181, 221, 255, 0.16)',
  text: '#F5F8FF',
  textMuted: '#AAB9CC',
  textFaint: '#7C8EA6',
  primary: '#85D6FF',
  primaryStrong: '#43B6FF',
  purple: '#A99CFF',
  success: '#83E1B1',
  danger: '#FF9EAF',
  input: 'rgba(5, 15, 27, 0.56)',
};

export const spacing = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
};

export const sharedStyles = StyleSheet.create({
  glassCard: {
    backgroundColor: colors.glass,
    borderColor: colors.glassBorder,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  body: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 23,
  },
});
