import { Pressable, StyleSheet, type GestureResponderEvent } from 'react-native';

import { radii, type AppColors } from '../theme/theme';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { InterfaceIcon, type InterfaceIconName } from './InterfaceIcon';
import { Icon, type IconName } from './Icon';

interface IconButtonProps {
  accessibilityLabel: string;
  icon: IconName;
  onPress(event: GestureResponderEvent): void;
  disabled?: boolean;
  interfaceIcon?: InterfaceIconName;
  size?: number;
  tone?: 'default' | 'media' | 'primary';
}

export function IconButton({
  accessibilityLabel,
  icon,
  onPress,
  disabled = false,
  interfaceIcon,
  size = 48,
  tone = 'default',
}: IconButtonProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      android_ripple={{ color: tone === 'primary' ? colors.onAccentSubtle : tone === 'media' ? colors.onMediaFaint : colors.accentSubtle }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { height: Math.max(size, 48), width: Math.max(size, 48) },
        tone === 'media' && styles.media,
        tone === 'primary' && styles.primary,
        disabled && styles.disabled,
        pressed && !disabled && (tone === 'primary' ? styles.primaryPressed : tone === 'media' ? styles.mediaPressed : styles.pressed),
      ]}
    >
      {interfaceIcon ? (
        <InterfaceIcon
          color={tone === 'primary' ? colors.onAccent : tone === 'media' ? colors.onMedia : colors.textMuted}
          name={interfaceIcon}
          size={22}
        />
      ) : (
        <Icon color={tone === 'primary' ? colors.onAccent : tone === 'media' ? colors.onMedia : colors.textMuted} name={icon} size={22} />
      )}
    </Pressable>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  media: {
    backgroundColor: colors.mediaOverlay,
    borderColor: colors.mediaOverlayBorder,
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
  mediaPressed: {
    opacity: 0.78,
  },
  });
}
