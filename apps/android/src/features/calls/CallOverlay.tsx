import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useI18n } from '../../localization/I18nProvider';
import { colors, spacing } from '../../theme/theme';
import { Icon, type IconName } from '../../ui/Icon';
import type { CallAudioRoute } from './callAudio';
import { callPhaseKey, formatCallDuration } from './callPresentation';
import { useDirectCall } from './DirectCallProvider';

export function CallOverlay() {
  const { t } = useI18n();
  const {
    acceptCall,
    audioRoutes,
    call,
    dismissCall,
    endCall,
    rejectCall,
    selectAudioRoute,
    selectedAudioRouteId,
    toggleMute,
  } = useDirectCall();
  const [reduceMotion, setReduceMotion] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(value => {
        if (active) {
          setReduceMotion(value);
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
    if (call?.phase !== 'active' || !call.connectedAt) {
      return;
    }
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [call?.connectedAt, call?.phase]);

  if (!call) {
    return null;
  }

  const isIncoming = call.phase === 'incoming';
  const isFailed = call.phase === 'failed';
  const isActive = call.phase === 'active';
  const canEnd = !isIncoming && !isFailed && !isActive;
  const duration = call.connectedAt
    ? formatCallDuration(Math.max(0, Math.floor((now - call.connectedAt) / 1_000)))
    : null;
  const peerName = call.peerName || t('callUnknownCaller');
  const status = isFailed && call.failure ? t(call.failure) : t(callPhaseKey(call.phase));

  return (
    <Modal
      animationType={reduceMotion ? 'none' : 'fade'}
      onRequestClose={() => {
        if (isIncoming) {
          rejectCall();
        } else if (isFailed) {
          dismissCall();
        } else {
          endCall();
        }
      }}
      statusBarTranslucent
      visible
    >
      <SafeAreaView style={styles.safeArea}>
        <View pointerEvents="none" style={styles.primaryGlow} />
        <View pointerEvents="none" style={styles.secondaryGlow} />
        <View style={styles.content}>
          <View accessibilityElementsHidden style={styles.avatar}>
            <Text style={styles.avatarLabel}>{peerName.slice(0, 1).toUpperCase()}</Text>
            {isActive ? <View style={styles.connectedDot} /> : null}
          </View>

          <View accessibilityLiveRegion="polite" style={styles.copy}>
            <Text numberOfLines={2} style={styles.name}>{peerName}</Text>
            <Text style={styles.kind}>{t('callAudio')}</Text>
            <Text accessibilityRole="alert" style={[styles.status, isFailed && styles.statusFailed]}>
              {duration || status}
            </Text>
            {duration ? <Text style={styles.connectedLabel}>{status}</Text> : null}
          </View>

          {isIncoming ? (
            <View style={styles.incomingActions}>
              <CallAction
                accessibilityLabel={t('callDecline')}
                icon="hangUp"
                label={t('callDecline')}
                onPress={rejectCall}
                tone="danger"
              />
              <CallAction
                accessibilityLabel={t('callAccept')}
                icon="call"
                label={t('callAccept')}
                onPress={() => {
                  acceptCall().catch(() => undefined);
                }}
                tone="accept"
              />
            </View>
          ) : null}

          {isActive ? (
            <View style={styles.activeControls}>
              {audioRoutes.length > 1 ? (
                <View accessibilityLabel={t('callAudioRoute')} style={styles.routePicker}>
                  {audioRoutes.map(route => (
                    <CallRouteAction
                      key={route.id}
                      route={route}
                      selected={route.id === selectedAudioRouteId}
                      onPress={() => { selectAudioRoute(route.id).catch(() => undefined); }}
                    />
                  ))}
                </View>
              ) : null}
              <View style={styles.activeActions}>
                <CallAction
                  accessibilityLabel={call.isMuted ? t('callUnmute') : t('callMute')}
                  icon={call.isMuted ? 'microphoneOff' : 'microphone'}
                  label={call.isMuted ? t('callUnmute') : t('callMute')}
                  onPress={toggleMute}
                  selected={call.isMuted}
                  tone="default"
                />
                <CallAction
                  accessibilityLabel={t('callEnd')}
                  icon="hangUp"
                  label={t('callEnd')}
                  onPress={endCall}
                  tone="danger"
                />
              </View>
            </View>
          ) : null}

          {canEnd ? (
            <View style={styles.singleAction}>
              <CallAction
                accessibilityLabel={t('callEnd')}
                icon="hangUp"
                label={t('callEnd')}
                onPress={endCall}
                tone="danger"
              />
            </View>
          ) : null}

          {isFailed ? (
            <Pressable
              accessibilityLabel={t('callClose')}
              accessibilityRole="button"
              onPress={dismissCall}
              style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
            >
              <Text style={styles.closeLabel}>{t('callClose')}</Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function CallRouteAction({ onPress, route, selected }: {
  onPress(): void;
  route: CallAudioRoute;
  selected: boolean;
}) {
  const { t } = useI18n();
  const presentation = routePresentation(route, t);

  return (
    <Pressable
      accessibilityLabel={presentation.label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.routeButton,
        selected && styles.routeButtonSelected,
        pressed && styles.routeButtonPressed,
      ]}
    >
      <Icon color={selected ? colors.canvas : colors.text} name={presentation.icon} size={20} />
      <Text numberOfLines={1} style={[styles.routeLabel, selected && styles.routeLabelSelected]}>
        {presentation.label}
      </Text>
    </Pressable>
  );
}

function routePresentation(route: CallAudioRoute, t: ReturnType<typeof useI18n>['t']): {
  icon: IconName;
  label: string;
} {
  switch (route.kind) {
    case 'bluetooth':
      return { icon: 'bluetooth', label: t('callRouteBluetooth') };
    case 'earpiece':
      return { icon: 'call', label: t('callRouteEarpiece') };
    case 'speaker':
      return { icon: 'speaker', label: t('callRouteSpeaker') };
    case 'wired':
      return { icon: 'microphone', label: t('callRouteWired') };
  }
}

interface CallActionProps {
  accessibilityLabel: string;
  icon: 'call' | 'hangUp' | 'microphone' | 'microphoneOff';
  label: string;
  onPress(): void;
  selected?: boolean;
  tone: 'accept' | 'danger' | 'default';
}

function CallAction({ accessibilityLabel, icon, label, onPress, selected = false, tone }: CallActionProps) {
  const iconColor = tone === 'default' ? colors.text : colors.canvas;

  return (
    <View style={styles.actionItem}>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={onPress}
        style={({ pressed }) => [
          styles.actionButton,
          tone === 'accept' && styles.acceptButton,
          tone === 'danger' && styles.dangerButton,
          selected && styles.selectedButton,
          pressed && styles.actionButtonPressed,
        ]}
      >
        <Icon color={iconColor} name={icon} size={27} />
      </Pressable>
      <Text style={styles.actionLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.canvas,
    flex: 1,
  },
  primaryGlow: {
    backgroundColor: 'rgba(74, 168, 240, 0.14)',
    borderRadius: 240,
    height: 360,
    position: 'absolute',
    right: -156,
    top: -136,
    width: 360,
  },
  secondaryGlow: {
    backgroundColor: 'rgba(178, 169, 255, 0.08)',
    borderRadius: 220,
    bottom: -140,
    height: 320,
    left: -166,
    position: 'absolute',
    width: 320,
  },
  content: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'space-between',
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.glassBorder,
    borderRadius: 76,
    borderWidth: StyleSheet.hairlineWidth,
    height: 152,
    justifyContent: 'center',
    position: 'relative',
    width: 152,
  },
  avatarLabel: {
    color: colors.primary,
    fontSize: 60,
    fontWeight: '500',
  },
  connectedDot: {
    backgroundColor: colors.success,
    borderColor: colors.canvas,
    borderRadius: 11,
    borderWidth: 4,
    bottom: 10,
    height: 22,
    position: 'absolute',
    right: 10,
    width: 22,
  },
  copy: {
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: 440,
  },
  name: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  kind: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
  },
  status: {
    color: colors.primary,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 24,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  statusFailed: {
    color: colors.danger,
  },
  connectedLabel: {
    color: colors.textFaint,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  incomingActions: {
    flexDirection: 'row',
    gap: spacing.xxl,
  },
  activeActions: {
    flexDirection: 'row',
    gap: spacing.xxl,
  },
  activeControls: {
    alignItems: 'center',
    gap: spacing.lg,
  },
  routePicker: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'center',
    maxWidth: 440,
  },
  routeButton: {
    alignItems: 'center',
    borderColor: colors.glassBorder,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  routeButtonSelected: {
    backgroundColor: colors.primaryStrong,
    borderColor: colors.primary,
  },
  routeButtonPressed: {
    backgroundColor: colors.surfacePressed,
  },
  routeLabel: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
    maxWidth: 112,
  },
  routeLabelSelected: {
    color: colors.canvas,
  },
  singleAction: {
    minHeight: 102,
  },
  actionItem: {
    alignItems: 'center',
    gap: spacing.xs,
    width: 88,
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.glassBorder,
    borderRadius: 36,
    borderWidth: StyleSheet.hairlineWidth,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  acceptButton: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  dangerButton: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  selectedButton: {
    backgroundColor: colors.primaryStrong,
    borderColor: colors.primary,
  },
  actionButtonPressed: {
    opacity: 0.78,
  },
  actionLabel: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    textAlign: 'center',
  },
  closeButton: {
    alignItems: 'center',
    borderColor: colors.glassBorder,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 52,
    minWidth: 132,
    paddingHorizontal: spacing.md,
  },
  closeButtonPressed: {
    backgroundColor: colors.surfacePressed,
  },
  closeLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
});
