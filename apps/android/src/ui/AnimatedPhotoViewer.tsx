import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { motion, spacing, type AppColors } from '../theme/theme';
import { useThemedStyles } from '../theme/ThemeProvider';
import { IconButton } from './IconButton';

interface AnimatedPhotoViewerProps {
  closeLabel: string;
  name: string | null;
  onClose(): void;
  uri: string | null;
}

export function AnimatedPhotoViewer({ closeLabel, name, onClose, uri }: AnimatedPhotoViewerProps) {
  const styles = useThemedStyles(createStyles);
  const [mounted, setMounted] = useState(Boolean(uri));
  const [displayedPhoto, setDisplayedPhoto] = useState<PhotoViewerState | null>(() =>
    uri ? { name, uri } : null,
  );
  const [reduceMotion, setReduceMotion] = useState(false);
  const progress = useRef(new Animated.Value(uri ? 1 : 0)).current;

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(enabled => {
        if (active) {
          setReduceMotion(enabled);
        }
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    progress.stopAnimation();
    if (uri) {
      setDisplayedPhoto({ name, uri });
      setMounted(true);
      if (reduceMotion) {
        progress.setValue(1);
        return;
      }
      progress.setValue(0);
      Animated.timing(progress, {
        duration: motion.standard,
        toValue: 1,
        useNativeDriver: true,
      }).start();
      return;
    }
    if (!mounted) {
      return;
    }
    if (reduceMotion) {
      progress.setValue(0);
      setMounted(false);
      setDisplayedPhoto(null);
      return;
    }
    Animated.timing(progress, {
      duration: motion.quick,
      toValue: 0,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setMounted(false);
        setDisplayedPhoto(null);
      }
    });
  }, [mounted, name, progress, reduceMotion, uri]);

  if (!mounted || !displayedPhoto) {
    return null;
  }

  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [motion.photoScaleFrom, 1],
  });

  return (
    <Modal animationType="none" onRequestClose={onClose} statusBarTranslucent transparent visible>
      <Animated.View style={[styles.viewer, { opacity: progress }]}>
        <Pressable
          accessibilityLabel={closeLabel}
          accessibilityRole="button"
          onPress={onClose}
          style={styles.backdrop}
        />
        <Animated.View style={[styles.content, { transform: [{ scale }] }]}>
          <Image
            accessibilityLabel={displayedPhoto.name ?? undefined}
            resizeMode="contain"
            source={{ uri: displayedPhoto.uri }}
            style={styles.image}
          />
          <View style={styles.header}>
            {displayedPhoto.name ? (
              <Text numberOfLines={1} style={styles.name}>{displayedPhoto.name}</Text>
            ) : <View style={styles.name} />}
            <IconButton accessibilityLabel={closeLabel} icon="close" onPress={onClose} tone="media" />
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

interface PhotoViewerState {
  name: string | null;
  uri: string;
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    viewer: {
      backgroundColor: colors.mediaViewer,
      flex: 1,
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
    },
    content: {
      flex: 1,
      justifyContent: 'center',
      padding: spacing.md,
    },
    image: {
      flex: 1,
      width: '100%',
    },
    header: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
      left: spacing.md,
      position: 'absolute',
      right: spacing.md,
      top: spacing.xl,
    },
    name: {
      color: colors.onMedia,
      flex: 1,
      fontSize: 15,
      fontWeight: '700',
    },
  });
}
