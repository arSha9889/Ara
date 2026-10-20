import { Pressable, StyleSheet, type GestureResponderEvent } from 'react-native';

import { colors } from '../theme/theme';
import { Icon, type IconName } from './Icon';

interface IconButtonProps {
  accessibilityLabel: string;
  icon: IconName;
  onPress(event: GestureResponderEvent): void;
  disabled?: boolean;
  size?: number;
  tone?: 'default' | 'primary';
}

export function IconButton({
  accessibilityLabel,
  icon,
  onPress,
  disabled = false,
  size = 48,
  tone = 'default',
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { height: Math.max(size, 48), width: Math.max(size, 48) },
        tone === 'primary' && styles.primary,
        disabled && styles.disabled,
        pressed && !disabled && (tone === 'primary' ? styles.primaryPressed : styles.pressed),
      ]}
    >
      <Icon color={tone === 'primary' ? colors.onAccent : colors.textMuted} name={icon} size={22} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  primaryPressed: {
    backgroundColor: colors.accentPressed,
    borderColor: colors.accentPressed,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    backgroundColor: colors.surfacePressed,
  },
});
