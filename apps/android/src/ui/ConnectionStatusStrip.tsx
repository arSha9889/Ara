import { StyleSheet, Text, View } from 'react-native';

import { useNetwork } from '../features/network/NetworkProvider';
import {
  connectionStatusPresentation,
  type ConnectionStatusTone,
} from '../features/network/connectionStatusPresentation';
import { useRealtimeConnectionStatus } from '../features/realtime/RealtimeProvider';
import { useI18n } from '../localization/I18nProvider';
import { colors, spacing } from '../theme/theme';
import { Icon } from './Icon';

export function ConnectionStatusStrip() {
  const { connection } = useNetwork();
  const realtimeConnectionStatus = useRealtimeConnectionStatus();
  const { t } = useI18n();
  const presentation = connectionStatusPresentation(connection, realtimeConnectionStatus);

  if (!presentation) {
    return null;
  }

  const label = t(presentation.key);
  const isOffline = presentation.tone === 'danger';

  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityLiveRegion={isOffline ? 'assertive' : 'polite'}
      accessibilityRole={isOffline ? 'alert' : undefined}
      style={[
        styles.container,
        presentation.tone === 'danger' && styles.containerDanger,
        presentation.tone === 'primary' && styles.containerPrimary,
      ]}
      testID="network-status-strip"
    >
      <Icon color={toneColor(presentation.tone)} name={presentation.icon} size={18} />
      <Text style={[styles.label, { color: toneColor(presentation.tone) }]}>{label}</Text>
    </View>
  );
}

function toneColor(tone: ConnectionStatusTone): string {
  switch (tone) {
    case 'danger':
      return colors.danger;
    case 'primary':
      return colors.primary;
    case 'success':
      return colors.success;
  }
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.glassBorder,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.xs,
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  containerDanger: {
    borderColor: colors.danger,
  },
  containerPrimary: {
    borderColor: colors.primaryStrong,
  },
  label: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
});
