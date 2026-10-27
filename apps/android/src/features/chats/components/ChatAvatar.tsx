import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { avatarEmoji, uploadedAvatarUrl } from '../../profile/avatar';
import type { AppColors } from '../../../theme/theme';
import { useThemedStyles } from '../../../theme/ThemeProvider';

interface ChatAvatarProps {
  avatarRef?: string | null;
  avatarType?: string | null;
  isOnline?: boolean;
  label: string;
  size: 'small' | 'regular';
}

export function ChatAvatar({
  avatarRef,
  avatarType,
  isOnline = false,
  label,
  size,
}: ChatAvatarProps) {
  const styles = useThemedStyles(createStyles);
  const imageUrl = uploadedAvatarUrl(avatarType, avatarRef);
  const [imageUnavailable, setImageUnavailable] = useState(false);
  const emoji = avatarType === 'built_in' ? avatarEmoji(avatarRef ?? undefined) : null;

  useEffect(() => {
    setImageUnavailable(false);
  }, [imageUrl]);

  const initials = label.trim().slice(0, 1).toUpperCase() || 'A';
  const hasImage = Boolean(imageUrl && !imageUnavailable);

  return (
    <View accessibilityElementsHidden style={[styles.avatar, size === 'regular' ? styles.regular : styles.small]}>
      {hasImage && imageUrl ? (
        <Image onError={() => setImageUnavailable(true)} source={{ uri: imageUrl }} style={styles.image} />
      ) : (
        <Text style={emoji ? (size === 'regular' ? styles.regularEmoji : styles.smallEmoji) : size === 'regular' ? styles.regularLabel : styles.smallLabel}>
          {emoji ?? initials}
        </Text>
      )}
      {isOnline ? <View style={styles.onlineDot} /> : null}
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.borderSubtle,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    position: 'relative',
  },
  regular: {
    borderRadius: 24,
    height: 48,
    width: 48,
  },
  small: {
    borderRadius: 16,
    height: 32,
    width: 32,
  },
  image: {
    borderRadius: 999,
    height: '100%',
    width: '100%',
  },
  regularEmoji: {
    fontSize: 24,
  },
  smallEmoji: {
    fontSize: 18,
  },
  regularLabel: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  smallLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  onlineDot: {
    backgroundColor: colors.success,
    borderColor: colors.surface,
    borderRadius: 6,
    borderWidth: 2,
    bottom: -1,
    height: 12,
    position: 'absolute',
    right: -1,
    width: 12,
  },
  });
}
