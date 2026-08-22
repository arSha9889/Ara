import { Pressable, StyleSheet, Text, type GestureResponderEvent } from 'react-native';

import { colors } from '../theme/theme';

interface PrimaryButtonProps {
  label: string;
  onPress(event: GestureResponderEvent): void;
  disabled?: boolean;
  accessibilityHint?: string;
}

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  accessibilityHint,
}: PrimaryButtonProps) {
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: colors.primaryStrong,
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 20,
  },
  disabled: {
    backgroundColor: 'rgba(67, 182, 255, 0.28)',
  },
  pressed: {
    opacity: 0.82,
  },
  label: {
    color: colors.canvas,
    fontSize: 16,
    fontWeight: '700',
  },
});
