import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { colors } from '../theme/theme';

interface HaloMarkProps {
  size?: number;
}

export function HaloMark({ size = 92 }: HaloMarkProps) {
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
          styles.outerRing,
          {
            borderRadius: size / 2,
            height: size,
            transform: [{ scale: pulse }],
            width: size,
          },
        ]}
      />
      <View
        style={[
          styles.innerRing,
          {
            borderRadius: (size * 0.68) / 2,
            height: size * 0.68,
            width: size * 0.68,
          },
        ]}
      >
        <Text accessibilityLabel="AraChat" style={[styles.letter, { fontSize: size * 0.34 }]}>
          A
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerRing: {
    backgroundColor: 'rgba(133, 214, 255, 0.12)',
    borderColor: 'rgba(133, 214, 255, 0.58)',
    borderWidth: 1,
    position: 'absolute',
  },
  innerRing: {
    alignItems: 'center',
    backgroundColor: 'rgba(67, 182, 255, 0.22)',
    borderColor: 'rgba(245, 248, 255, 0.36)',
    borderWidth: 1,
    justifyContent: 'center',
  },
  letter: {
    color: colors.text,
    fontWeight: '700',
  },
});
