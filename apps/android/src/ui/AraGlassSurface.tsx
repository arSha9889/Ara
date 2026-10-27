import type { PropsWithChildren } from 'react';
import { LiquidGlassView } from '@sbaiahmed1/react-native-blur';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { AppColors } from '../theme/theme';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';

interface AraGlassSurfaceProps extends PropsWithChildren {
  style?: StyleProp<ViewStyle>;
  variant?: 'chrome' | 'media' | 'sheet';
}

export function AraGlassSurface({ children, style, variant = 'chrome' }: AraGlassSurfaceProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const surfaceStyle = [styles.surface, styles[variant], style];

  if (Platform.OS !== 'android') {
    return <View style={surfaceStyle}>{children}</View>;
  }

  return (
    <LiquidGlassView
      glassOpacity={variant === 'media' ? 0.72 : 0.86}
      glassTintColor={variant === 'media' ? colors.mediaOverlay : colors.glassStrong}
      glassType="regular"
      isInteractive={false}
      style={surfaceStyle}
    >
      {children}
    </LiquidGlassView>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    surface: {
      backgroundColor: colors.glassStrong,
      borderColor: colors.glassBorder,
      borderWidth: StyleSheet.hairlineWidth,
      elevation: 2,
      shadowColor: colors.shadow,
      shadowOffset: { height: 3, width: 0 },
      shadowOpacity: 0.14,
      shadowRadius: 10,
    },
    chrome: {},
    media: {
      backgroundColor: colors.mediaOverlay,
      borderColor: colors.mediaOverlayBorder,
    },
    sheet: {},
  });
}
