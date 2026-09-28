import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { colors, spacing } from '../theme/theme';
import { ConnectionStatusStrip } from './ConnectionStatusStrip';

interface AppScreenProps extends PropsWithChildren {
  bottomSafeArea?: boolean;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}

const screenEdges: Edge[] = ['top', 'left', 'right'];
const screenEdgesWithBottom: Edge[] = ['top', 'bottom', 'left', 'right'];

export function AppScreen({ children, bottomSafeArea = false, scroll = true, contentStyle }: AppScreenProps) {
  const content = <View style={[styles.content, contentStyle]}>{children}</View>;

  return (
    <SafeAreaView edges={bottomSafeArea ? screenEdgesWithBottom : screenEdges} style={styles.safeArea}>
      <View pointerEvents="none" style={styles.topGlow} />
      <ConnectionStatusStrip />
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>{content}</ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.canvas,
    flex: 1,
  },
  topGlow: {
    backgroundColor: 'rgba(74, 168, 240, 0.06)',
    borderRadius: 180,
    height: 240,
    position: 'absolute',
    right: -100,
    top: -150,
    width: 240,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
});
