import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Image,
  StyleSheet,
  View,
} from 'react-native';

import type { AppColors } from '../theme/theme';
import { useThemedStyles } from '../theme/ThemeProvider';

interface HaloMarkProps {
  size?: number;
}

export function HaloMark({ size = 92 }: HaloMarkProps) {
  const styles = useThemedStyles(createStyles);
  const [reduceMotion, setReduceMotion] = useState(false);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(enabled => {
      if (mounted) {
        setReduceMotion(enabled);
      }
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      pulse.setValue(1);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.06,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();

    return () => animation.stop();
  }, [pulse, reduceMotion]);

  return (
    <View style={[styles.container, { height: size, width: size }]}>
      <Animated.View
        style={[
          styles.logoFrame,
          {
            borderRadius: size * 0.24,
            height: size,
            transform: [{ scale: pulse }],
            width: size,
          },
        ]}
      >
        <Image
          accessible={false}
          source={require('../assets/arachat-parrot-icon.png')}
          style={[styles.logo, { borderRadius: size * 0.24, height: size, width: size }]}
        />
      </Animated.View>
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoFrame: {
    overflow: 'hidden',
    shadowColor: colors.shadow,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
  },
  logo: { resizeMode: 'cover' },
  });
}
