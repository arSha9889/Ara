import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useNetwork } from '../features/network/NetworkProvider';
import {
  connectionStatusPresentation,
  type ConnectionStatusPresentation,
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
  const [visiblePresentation, setVisiblePresentation] =
    useState<ConnectionStatusPresentation | null>(null);
  const presentationIcon = presentation?.icon;
  const presentationKey = presentation?.key;
  const presentationTone = presentation?.tone;

  useEffect(() => {
    if (!presentationIcon || !presentationKey || !presentationTone) {
      setVisiblePresentation(null);
      return undefined;
    }

    const nextPresentation: ConnectionStatusPresentation = {
      icon: presentationIcon,
      key: presentationKey,
      tone: presentationTone,
    };
    if (presentationTone === 'danger') {
      setVisiblePresentation(nextPresentation);
      return undefined;
    }

    if (visiblePresentation?.tone === 'primary') {
      setVisiblePresentation(nextPresentation);
      return undefined;
    }

    setVisiblePresentation(null);
    const timer = setTimeout(() => {
      setVisiblePresentation(nextPresentation);
    }, TRANSIENT_STATUS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [presentationIcon, presentationKey, presentationTone, visiblePresentation?.tone]);

  if (!visiblePresentation) {
    return null;
  }

  const label = t(visiblePresentation.key);
  const isOffline = visiblePresentation.tone === 'danger';

  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityLiveRegion={isOffline ? 'assertive' : 'polite'}
      accessibilityRole={isOffline ? 'alert' : undefined}
      style={[
        styles.container,
        visiblePresentation.tone === 'danger' && styles.containerDanger,
        visiblePresentation.tone === 'primary' && styles.containerPrimary,
      ]}
      testID="network-status-strip"
    >
      <Icon color={toneColor(visiblePresentation.tone)} name={visiblePresentation.icon} size={18} />
      <Text style={[styles.label, { color: toneColor(visiblePresentation.tone) }]}>{label}</Text>
    </View>
  );
}

function toneColor(tone: ConnectionStatusTone): string {
  switch (tone) {
    case 'danger':
      return colors.danger;
    case 'primary':
      return colors.accent;
  }
}

const TRANSIENT_STATUS_DELAY_MS = 1_500;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
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
    borderColor: colors.accent,
  },
  label: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
});
