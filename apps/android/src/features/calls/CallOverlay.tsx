import { useCallback, useEffect, useState } from 'react';
import {
  BackHandler,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { RTCView } from 'react-native-webrtc';

import { useI18n } from '../../localization/I18nProvider';
import { radii, spacing, type AppColors } from '../../theme/theme';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { AraGlassSurface } from '../../ui/AraGlassSurface';
import { ConnectionStatusStrip } from '../../ui/ConnectionStatusStrip';
import { Icon, type IconName } from '../../ui/Icon';
import type { CallAudioRoute } from './callAudio';
import { callPhaseKey, formatCallDuration } from './callPresentation';
import { useDirectCall } from './DirectCallProvider';
import { subscribeToPictureInPicture } from './callForeground';

export function CallOverlay() {
  const { t } = useI18n();
  const styles = useThemedStyles(createStyles);
  const {
    acceptCall,
    audioRoutes,
    call,
    dismissCall,
    endCall,
    rejectCall,
    selectAudioRoute,
    selectedAudioRouteId,
    switchCamera,
    toggleMute,
    toggleVideo,
  } = useDirectCall();
  const [now, setNow] = useState(Date.now());
  const [isInPictureInPicture, setIsInPictureInPicture] = useState(false);

  const handleRequestClose = useCallback((): void => {
    if (!call) {
      return;
    }
    if (call.phase === 'incoming') {
      rejectCall();
    } else if (call.phase === 'failed') {
      dismissCall();
    } else {
      endCall();
    }
  }, [call, dismissCall, endCall, rejectCall]);

  useEffect(() => {
    if (call?.phase !== 'active' || !call.connectedAt) {
      return;
    }
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [call?.connectedAt, call?.phase]);

  useEffect(() => subscribeToPictureInPicture(event => {
    setIsInPictureInPicture(event.isInPictureInPicture);
  }), []);

  useEffect(() => {
    if (!call) {
      return;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleRequestClose();
      return true;
    });
    return () => subscription.remove();
  }, [call, handleRequestClose]);

  if (!call) {
    return null;
  }

  const isIncoming = call.phase === 'incoming';
  const isFailed = call.phase === 'failed';
  const isActive = call.phase === 'active';
  const isVideoCall = call.callType === 'video';
  const showVideoStage = isVideoCall && !isIncoming && !isFailed;
  const canEnd = !isIncoming && !isFailed && !isActive;
  const duration = call.connectedAt
    ? formatCallDuration(Math.max(0, Math.floor((now - call.connectedAt) / 1_000)))
    : null;
  const peerName = call.peerName || t('callUnknownCaller');
  const status = isFailed && call.failure
    ? t(call.failure === 'callPermissionDenied' && isVideoCall
      ? 'callCameraAndMicrophonePermissionDenied'
      : call.failure)
    : t(callPhaseKey(call));
  const pictureInPictureStream = call.remoteStream ?? call.localStream;

  if (isInPictureInPicture && isVideoCall) {
    return (
      <View style={styles.pictureInPictureStage}>
        {pictureInPictureStream ? (
          <RTCView
            accessible={false}
            mirror={!call.remoteStream && call.isFrontCamera}
            objectFit="cover"
            pointerEvents="none"
            streamURL={pictureInPictureStream.toURL()}
            style={styles.remoteVideo}
            zOrder={0}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.overlay}>
      <SafeAreaView style={styles.safeArea}>
        {showVideoStage && call.remoteStream ? (
          <RTCView
            accessible={false}
            objectFit="cover"
            pointerEvents="none"
            streamURL={call.remoteStream.toURL()}
            style={styles.remoteVideo}
            zOrder={0}
          />
        ) : null}
        <View pointerEvents="none" style={styles.primaryGlow} />
        <View pointerEvents="none" style={styles.secondaryGlow} />
        <ConnectionStatusStrip />
        <View style={[styles.content, showVideoStage && styles.videoContent]}>
          {!showVideoStage ? (
            <View accessibilityElementsHidden style={styles.avatar}>
              <Text style={styles.avatarLabel}>{peerName.slice(0, 1).toUpperCase()}</Text>
              {isActive ? <View style={styles.connectedDot} /> : null}
            </View>
          ) : null}

          <View accessibilityLiveRegion="polite" style={[styles.copy, showVideoStage && styles.videoCopy]}>
            <Text numberOfLines={2} style={[styles.name, showVideoStage && styles.videoName]}>{peerName}</Text>
            <Text style={[styles.kind, showVideoStage && styles.videoKind]}>{isVideoCall ? t('callVideo') : t('callAudio')}</Text>
            <Text accessibilityRole="alert" style={[styles.status, showVideoStage && styles.videoStatus, isFailed && styles.statusFailed]}>
              {duration || status}
            </Text>
            {duration ? <Text style={[styles.connectedLabel, showVideoStage && styles.videoConnectedLabel]}>{status}</Text> : null}
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
                icon={isVideoCall ? 'video' : 'call'}
                label={t('callAccept')}
                onPress={() => {
                  acceptCall().catch(() => undefined);
                }}
                tone="accept"
              />
            </View>
          ) : null}

          {isActive ? (
            <AraGlassSurface
              style={styles.activeControlSurface}
              variant={showVideoStage ? 'media' : 'chrome'}
            >
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
                {isVideoCall ? (
                  <CallAction
                    accessibilityLabel={call.isVideoEnabled ? t('callCameraOff') : t('callCameraOn')}
                    icon={call.isVideoEnabled ? 'video' : 'videoOff'}
                    label={call.isVideoEnabled ? t('callCameraOff') : t('callCameraOn')}
                    onPress={toggleVideo}
                    selected={!call.isVideoEnabled}
                    tone="default"
                  />
                ) : null}
                {isVideoCall ? (
                  <CallAction
                    accessibilityLabel={t('callSwitchCamera')}
                    icon="cameraSwitch"
                    label={t('callSwitchCamera')}
                    onPress={switchCamera}
                    tone="default"
                  />
                ) : null}
                <CallAction
                  accessibilityLabel={t('callEnd')}
                  icon="hangUp"
                  label={t('callEnd')}
                  onPress={endCall}
                  tone="danger"
                />
              </View>
              </View>
            </AraGlassSurface>
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
        {showVideoStage && call.localStream && call.isVideoEnabled ? (
          <RTCView
            accessible={false}
            mirror={call.isFrontCamera}
            objectFit="cover"
            pointerEvents="none"
            streamURL={call.localStream.toURL()}
            style={styles.localVideo}
            zOrder={1}
          />
        ) : null}
      </SafeAreaView>
    </View>
  );
}

function CallRouteAction({ onPress, route, selected }: {
  onPress(): void;
  route: CallAudioRoute;
  selected: boolean;
}) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
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
      <Icon color={selected ? colors.onAccent : colors.text} name={presentation.icon} size={20} />
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
  icon: IconName;
  label: string;
  onPress(): void;
  selected?: boolean;
  tone: 'accept' | 'danger' | 'default';
}

function CallAction({ accessibilityLabel, icon, label, onPress, selected = false, tone }: CallActionProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const iconColor = tone === 'default' ? colors.text : colors.onAccent;

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

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.canvas,
    elevation: 16,
  },
  pictureInPictureStage: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.canvas,
  },
  safeArea: {
    backgroundColor: colors.canvas,
    flex: 1,
  },
  primaryGlow: {
    backgroundColor: colors.callOverlayPrimaryGlow,
    borderRadius: 240,
    height: 360,
    position: 'absolute',
    right: -156,
    top: -136,
    width: 360,
  },
  secondaryGlow: {
    backgroundColor: colors.callOverlaySecondaryGlow,
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
  videoContent: {
    paddingTop: spacing.lg,
  },
  remoteVideo: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  localVideo: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.glassBorder,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    height: 156,
    overflow: 'hidden',
    position: 'absolute',
    right: spacing.md,
    top: spacing.xxl + spacing.xl + spacing.xs,
    width: 112,
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
  videoCopy: {
    backgroundColor: colors.mediaOverlay,
    borderColor: colors.mediaOverlayBorder,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  name: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  videoName: {
    color: colors.onMedia,
  },
  kind: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
  },
  videoKind: {
    color: colors.onMediaMuted,
  },
  status: {
    color: colors.primary,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 24,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  videoStatus: {
    color: colors.onMedia,
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
  videoConnectedLabel: {
    color: colors.onMediaFaint,
  },
  incomingActions: {
    flexDirection: 'row',
    gap: spacing.xxl,
  },
  activeActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxl,
    justifyContent: 'center',
    maxWidth: 440,
  },
  activeControls: {
    alignItems: 'center',
    gap: spacing.lg,
  },
  activeControlSurface: {
    alignSelf: 'center',
    borderRadius: radii.card,
    maxWidth: 440,
    padding: spacing.sm,
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
    minHeight: 48,
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
    color: colors.onAccent,
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
}
