import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { motion, radii, spacing, type AppColors } from '../theme/theme';
import { useThemedStyles } from '../theme/ThemeProvider';
import { AraGlassSurface } from './AraGlassSurface';

interface AnimatedBottomSheetProps {
  accessibilityLabel: string;
  children: ReactNode;
  disabled?: boolean;
  keyboardAvoiding?: boolean;
  onClose(): void;
  sheetStyle?: StyleProp<ViewStyle>;
  visible: boolean;
}

export function AnimatedBottomSheet({
  accessibilityLabel,
  children,
  disabled = false,
  keyboardAvoiding = false,
  onClose,
  sheetStyle,
  visible,
}: AnimatedBottomSheetProps) {
  const styles = useThemedStyles(createStyles);
  const [mounted, setMounted] = useState(visible);
  const [reduceMotion, setReduceMotion] = useState(false);
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;

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

    if (visible) {
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
      return;
    }
    Animated.timing(progress, {
      duration: motion.quick,
      toValue: 0,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setMounted(false);
      }
    });
  }, [mounted, progress, reduceMotion, visible]);

  if (!mounted) {
    return null;
  }

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [motion.sheetOffset, 0],
  });

  const sheet = (
    <Animated.View
      accessibilityViewIsModal
      style={[styles.sheetAnimation, { opacity: progress, transform: [{ translateY }] }]}
    >
      <AraGlassSurface style={[styles.sheet, sheetStyle]} variant="sheet">
        {children}
      </AraGlassSurface>
    </Animated.View>
  );

  return (
    <Modal
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={mounted}
    >
      <View style={styles.overlay}>
        <Animated.View pointerEvents="none" style={[styles.backdrop, { opacity: progress }]} />
        <Pressable
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="button"
          disabled={disabled}
          onPress={onClose}
          style={styles.backdropPressable}
        />
        {keyboardAvoiding ? (
          <KeyboardAvoidingView
            behavior={Platform.select({ android: 'height', ios: 'padding' })}
            style={styles.keyboardAvoiding}
          >
            {sheet}
          </KeyboardAvoidingView>
        ) : sheet}
      </View>
    </Modal>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.overlay,
    },
    backdropPressable: {
      ...StyleSheet.absoluteFill,
    },
    sheetAnimation: {
      width: '100%',
    },
    keyboardAvoiding: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    sheet: {
      borderBottomWidth: 0,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      borderTopLeftRadius: radii.sheet,
      borderTopRightRadius: radii.sheet,
      overflow: 'hidden',
      padding: spacing.lg,
      paddingBottom: Platform.select({ android: spacing.xl, default: spacing.lg }),
    },
  });
}
