import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { spacing, type AppColors } from '../theme/theme';
import { useThemedStyles } from '../theme/ThemeProvider';
import { ConnectionStatusStrip } from './ConnectionStatusStrip';

interface AppScreenProps extends PropsWithChildren {
  bottomSafeArea?: boolean;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}

const screenEdges: Edge[] = ['top', 'left', 'right'];
const screenEdgesWithBottom: Edge[] = ['top', 'bottom', 'left', 'right'];

export function AppScreen({ children, bottomSafeArea = false, scroll = true, contentStyle }: AppScreenProps) {
  const styles = useThemedStyles(createStyles);
  const content = (
    <View style={[scroll ? styles.scrollableContent : styles.content, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView edges={bottomSafeArea ? screenEdgesWithBottom : screenEdges} style={styles.safeArea}>
      <View pointerEvents="none" style={styles.primaryGlow} />
      <View pointerEvents="none" style={styles.secondaryGlow} />
      <ConnectionStatusStrip />
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>{content}</ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  safeArea: {
    backgroundColor: colors.canvas,
    flex: 1,
  },
   primaryGlow: {
      backgroundColor: colors.accentSubtle,
      borderRadius: 220,
      height: 380,
      opacity: 0.72,
      position: 'absolute',
      right: -190,
      top: -244,
      width: 380,
    },
    secondaryGlow: {
      backgroundColor: colors.accentSubtle,
      borderRadius: 150,
      bottom: -224,
      height: 260,
      left: -172,
      opacity: 0.34,
      position: 'absolute',
      width: 260,
   },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    alignSelf: 'center',
    flex: 1,
     maxWidth: 680,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    width: '100%',
  },
  scrollableContent: {
    alignSelf: 'center',
    flexGrow: 1,
     maxWidth: 680,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    width: '100%',
  },
  });
}
