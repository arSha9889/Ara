import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useI18n } from '../../../localization/I18nProvider';
import { colors, spacing } from '../../../theme/theme';
import { Icon } from '../../../ui/Icon';
import {
  downloadPrivateChatMedia,
  getCachedChatAudioPlaybackState,
  openCachedChatMedia,
  playCachedChatVideoNote,
  playCachedChatVideo,
  stopCachedChatAudioPlayback,
  toggleCachedChatAudioPlayback,
} from '../media/mediaClient';

interface ChatPhotoAttachmentProps {
  mediaUrl: string;
  mimeType: string | null;
  onOpen(uri: string, name: string): void;
}

interface ChatFileAttachmentProps {
  mediaSizeBytes: number | null;
  mediaUrl: string;
  mimeType: string | null;
}

interface ChatVideoAttachmentProps {
  mediaSizeBytes: number | null;
  mediaUrl: string;
  mimeType: string | null;
}

interface ChatVoiceAttachmentProps {
  durationSeconds: number | null;
  mediaUrl: string;
  mimeType: string | null;
}

interface ChatVideoNoteAttachmentProps {
  durationSeconds: number | null;
  mediaUrl: string;
  mimeType: string | null;
}

export function ChatPhotoAttachment({
  mediaUrl,
  mimeType,
  onOpen,
}: ChatPhotoAttachmentProps) {
  const { t } = useI18n();
  const [cachedUri, setCachedUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setCachedUri(null);
    setIsLoading(true);
    setHasFailed(false);

    downloadPrivateChatMedia(mediaUrl, mimeType ?? 'image/jpeg')
      .then(uri => {
        if (active) {
          setCachedUri(uri);
        }
      })
      .catch(() => {
        if (active) {
          setHasFailed(true);
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [mediaUrl, mimeType]);

  if (hasFailed) {
    return (
      <View accessibilityRole="alert" style={styles.unavailablePhoto}>
        <Icon color={colors.textFaint} name="photo" size={24} />
        <Text style={styles.unavailableLabel}>{t('attachmentPreviewUnavailable')}</Text>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityHint={t('openAttachmentHint')}
      accessibilityLabel={t('chatPhoto')}
      accessibilityRole="button"
      disabled={!cachedUri || isLoading}
      onPress={() => {
        if (cachedUri) {
          onOpen(cachedUri, t('chatPhoto'));
        }
      }}
      style={({ pressed }) => [
        styles.photoButton,
        pressed && cachedUri && styles.attachmentPressed,
      ]}
    >
      {cachedUri ? (
        <Image
          accessibilityLabel={t('chatPhoto')}
          resizeMode="cover"
          source={{ uri: cachedUri }}
          style={styles.photo}
        />
      ) : (
        <View style={styles.photoLoading}>
          {isLoading ? <ActivityIndicator color={colors.primary} /> : null}
          <Text style={styles.loadingLabel}>{t('attachmentLoading')}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function ChatFileAttachment({
  mediaSizeBytes,
  mediaUrl,
  mimeType,
}: ChatFileAttachmentProps) {
  const { t } = useI18n();
  const [isOpening, setIsOpening] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  const name = t('chatFile');
  const typeLabel = mimeType === 'application/pdf' ? 'PDF' : mimeType === 'text/plain' ? 'TXT' : t('chatFile');

  async function openFile(): Promise<void> {
    if (isOpening) {
      return;
    }

    setIsOpening(true);
    setHasFailed(false);
    try {
      const cachedUri = await downloadPrivateChatMedia(
        mediaUrl,
        mimeType ?? 'application/octet-stream',
      );
      await openCachedChatMedia(cachedUri, mimeType ?? 'application/octet-stream');
    } catch {
      setHasFailed(true);
    } finally {
      setIsOpening(false);
    }
  }

  return (
    <Pressable
      accessibilityHint={t('openAttachmentHint')}
      accessibilityLabel={`${t('chatFile')}: ${name}`}
      accessibilityRole="button"
      disabled={isOpening}
      onPress={() => {
        openFile().catch(() => undefined);
      }}
      style={({ pressed }) => [
        styles.fileCard,
        isOpening && styles.fileCardPending,
        pressed && !isOpening && styles.attachmentPressed,
      ]}
    >
      <View style={styles.fileIcon}>
        {isOpening ? (
          <ActivityIndicator color={colors.primary} size="small" />
        ) : (
          <Icon color={colors.primary} name="file" size={22} />
        )}
      </View>
      <View style={styles.fileDetails}>
        <Text numberOfLines={2} style={styles.fileName}>
          {name}
        </Text>
        <Text style={styles.fileMeta}>
          {typeLabel}
          {mediaSizeBytes ? ` · ${formatBytes(mediaSizeBytes)}` : ''}
        </Text>
        {hasFailed ? (
          <Text accessibilityRole="alert" style={styles.fileError}>
            {t('attachmentOpenError')}
          </Text>
        ) : null}
      </View>
      <Icon color={colors.textMuted} name={isOpening ? 'download' : 'chevronRight'} size={20} />
    </Pressable>
  );
}

export function ChatVideoAttachment({
  mediaSizeBytes,
  mediaUrl,
  mimeType,
}: ChatVideoAttachmentProps) {
  const { t } = useI18n();
  const [isOpening, setIsOpening] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  const name = t('chatVideo');

  async function playVideo(): Promise<void> {
    if (isOpening) {
      return;
    }

    setIsOpening(true);
    setHasFailed(false);
    try {
      const cachedUri = await downloadPrivateChatMedia(mediaUrl, mimeType ?? 'video/mp4');
      await playCachedChatVideo(cachedUri, mimeType ?? 'video/mp4');
    } catch {
      setHasFailed(true);
    } finally {
      setIsOpening(false);
    }
  }

  return (
    <Pressable
      accessibilityHint={t('playVideoHint')}
      accessibilityLabel={`${t('chatVideo')}: ${name}`}
      accessibilityRole="button"
      disabled={isOpening}
      onPress={() => {
        playVideo().catch(() => undefined);
      }}
      style={({ pressed }) => [
        styles.videoCard,
        isOpening && styles.videoCardPending,
        pressed && !isOpening && styles.attachmentPressed,
      ]}
    >
      <View style={styles.videoPoster}>
        {isOpening ? (
          <ActivityIndicator color={colors.primary} size="small" />
        ) : (
          <View style={styles.videoPlayButton}>
            <Icon color={colors.canvas} name="play" size={22} />
          </View>
        )}
      </View>
      <View style={styles.videoDetails}>
        <Text numberOfLines={2} style={styles.videoName}>
          {name}
        </Text>
        <Text style={styles.videoMeta}>
          {videoFormatLabel(mimeType)}
          {mediaSizeBytes ? ` · ${formatBytes(mediaSizeBytes)}` : ''}
        </Text>
        {hasFailed ? (
          <Text accessibilityRole="alert" style={styles.videoError}>
            {t('attachmentOpenError')}
          </Text>
        ) : null}
      </View>
      <Icon color={colors.textMuted} name={isOpening ? 'download' : 'play'} size={20} />
    </Pressable>
  );
}

export function ChatVoiceAttachment({
  durationSeconds,
  mediaUrl,
  mimeType,
}: ChatVoiceAttachmentProps) {
  const { t } = useI18n();
  const [cachedUri, setCachedUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  const [playback, setPlayback] = useState({
    durationSeconds: 0,
    isPlaying: false,
    positionSeconds: 0,
  });
  const duration = Math.max(0, durationSeconds ?? playback.durationSeconds);
  const playbackPosition = Math.min(duration, Math.max(0, playback.positionSeconds));
  const progress = duration > 0 ? Math.min(1, playbackPosition / duration) : 0;
  const timeLabel = playback.isPlaying
    ? `${formatDuration(playbackPosition)} / ${formatDuration(duration)}`
    : formatDuration(duration);

  useEffect(() => {
    let active = true;
    setCachedUri(null);
    setIsLoading(true);
    setHasFailed(false);
    setPlayback({ durationSeconds: 0, isPlaying: false, positionSeconds: 0 });

    downloadPrivateChatMedia(mediaUrl, mimeType ?? 'audio/mp4')
      .then(uri => {
        if (active) {
          setCachedUri(uri);
        }
      })
      .catch(() => {
        if (active) {
          setHasFailed(true);
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [mediaUrl, mimeType]);

  useEffect(() => {
    if (!cachedUri) {
      return undefined;
    }

    let active = true;
    const refreshPlayback = () => {
      getCachedChatAudioPlaybackState(cachedUri)
        .then(nextState => {
          if (active) {
            setPlayback(nextState);
          }
        })
        .catch(() => undefined);
    };
    refreshPlayback();
    const timer = setInterval(refreshPlayback, 450);

    return () => {
      active = false;
      clearInterval(timer);
      stopCachedChatAudioPlayback(cachedUri).catch(() => undefined);
    };
  }, [cachedUri]);

  async function togglePlayback(): Promise<void> {
    if (!cachedUri || isToggling) {
      return;
    }

    setIsToggling(true);
    setHasFailed(false);
    try {
      setPlayback(await toggleCachedChatAudioPlayback(cachedUri, mimeType ?? 'audio/mp4'));
    } catch {
      setHasFailed(true);
    } finally {
      setIsToggling(false);
    }
  }

  return (
    <Pressable
      accessibilityHint={t('playVoiceHint')}
      accessibilityLabel={playback.isPlaying ? t('pauseVoice') : t('playVoice')}
      accessibilityRole="button"
      disabled={!cachedUri || isLoading || isToggling}
      onPress={() => {
        togglePlayback().catch(() => undefined);
      }}
      style={({ pressed }) => [
        styles.voiceCard,
        (isLoading || isToggling) && styles.voiceCardPending,
        pressed && cachedUri && styles.attachmentPressed,
      ]}
    >
      <View style={styles.voicePlayButton}>
        {isLoading || isToggling ? (
          <ActivityIndicator color={colors.canvas} size="small" />
        ) : (
          <Icon color={colors.canvas} name={playback.isPlaying ? 'pause' : 'play'} size={22} />
        )}
      </View>
      <View style={styles.voiceDetails}>
        <View style={styles.voiceHeading}>
          <Text style={styles.voiceTitle}>{t('chatVoice')}</Text>
          <Text style={styles.voiceTime}>
            {timeLabel}
          </Text>
        </View>
        <View accessibilityElementsHidden style={styles.voiceProgressTrack}>
          <View style={[styles.voiceProgressValue, { width: `${progress * 100}%` }]} />
        </View>
        {hasFailed ? (
          <Text accessibilityRole="alert" style={styles.voiceError}>
            {t('attachmentOpenError')}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function ChatVideoNoteAttachment({
  durationSeconds,
  mediaUrl,
  mimeType,
}: ChatVideoNoteAttachmentProps) {
  const { t } = useI18n();
  const [isOpening, setIsOpening] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);

  async function playVideoNote(): Promise<void> {
    if (isOpening) {
      return;
    }

    setIsOpening(true);
    setHasFailed(false);
    try {
      const cachedUri = await downloadPrivateChatMedia(mediaUrl, mimeType ?? 'video/mp4');
      await playCachedChatVideoNote(cachedUri, mimeType ?? 'video/mp4');
    } catch {
      setHasFailed(true);
    } finally {
      setIsOpening(false);
    }
  }

  return (
    <Pressable
      accessibilityHint={t('playVideoNoteHint')}
      accessibilityLabel={t('chatVideoNote')}
      accessibilityRole="button"
      disabled={isOpening}
      onPress={() => {
        playVideoNote().catch(() => undefined);
      }}
      style={({ pressed }) => [
        styles.videoNoteCard,
        isOpening && styles.videoNoteCardPending,
        pressed && !isOpening && styles.attachmentPressed,
      ]}
    >
      <View style={styles.videoNoteCircle}>
        {isOpening ? (
          <ActivityIndicator color={colors.canvas} size="small" />
        ) : (
          <Icon color={colors.canvas} name="play" size={34} />
        )}
        <Text style={styles.videoNoteDuration}>{formatDuration(durationSeconds ?? 0)}</Text>
      </View>
      <Text style={styles.videoNoteLabel}>{t('chatVideoNote')}</Text>
      {hasFailed ? (
        <Text accessibilityRole="alert" style={styles.videoNoteError}>
          {t('attachmentOpenError')}
        </Text>
      ) : null}
    </Pressable>
  );
}

function videoFormatLabel(mimeType: string | null): string {
  if (mimeType === 'video/webm') {
    return 'WebM';
  }
  if (mimeType === 'video/quicktime') {
    return 'MOV';
  }
  return 'MP4';
}

function formatBytes(value: number): string {
  if (value < 1024 * 1024) {
    return `${Math.max(1, Math.round(value / 1024))} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function formatDuration(value: number): string {
  const totalSeconds = Math.max(0, Math.round(value));
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  photoButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  photo: {
    backgroundColor: colors.canvasMuted,
    height: 208,
    width: 236,
  },
  photoLoading: {
    alignItems: 'center',
    backgroundColor: colors.canvasMuted,
    gap: spacing.xs,
    height: 156,
    justifyContent: 'center',
    width: 236,
  },
  loadingLabel: {
    color: colors.textFaint,
    fontSize: 13,
  },
  unavailablePhoto: {
    alignItems: 'center',
    backgroundColor: colors.canvasMuted,
    borderRadius: 14,
    gap: spacing.xs,
    height: 112,
    justifyContent: 'center',
    width: 236,
  },
  unavailableLabel: {
    color: colors.textMuted,
    fontSize: 13,
  },
  fileCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(9, 18, 31, 0.16)',
    borderColor: 'rgba(243, 247, 252, 0.18)',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 76,
    padding: spacing.sm,
    width: 236,
  },
  fileCardPending: {
    opacity: 0.7,
  },
  fileIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(140, 201, 255, 0.12)',
    borderRadius: 12,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  fileDetails: {
    flex: 1,
    minWidth: 0,
  },
  fileName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  fileMeta: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  fileError: {
    color: colors.danger,
    fontSize: 12,
    marginTop: 4,
  },
  videoCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(9, 18, 31, 0.16)',
    borderColor: 'rgba(243, 247, 252, 0.18)',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 100,
    overflow: 'hidden',
    width: 236,
  },
  videoCardPending: {
    opacity: 0.7,
  },
  videoPoster: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: colors.canvasMuted,
    justifyContent: 'center',
    width: 88,
  },
  videoPlayButton: {
    alignItems: 'center',
    backgroundColor: colors.primaryStrong,
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    paddingLeft: 2,
    width: 44,
  },
  videoDetails: {
    flex: 1,
    minWidth: 0,
    paddingVertical: spacing.sm,
  },
  videoName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  videoMeta: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  videoError: {
    color: colors.danger,
    fontSize: 12,
    marginTop: 4,
  },
  voiceCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(9, 18, 31, 0.16)',
    borderColor: 'rgba(243, 247, 252, 0.18)',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 76,
    padding: spacing.sm,
    width: 236,
  },
  voiceCardPending: {
    opacity: 0.7,
  },
  voicePlayButton: {
    alignItems: 'center',
    backgroundColor: colors.primaryStrong,
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    paddingLeft: 1,
    width: 48,
  },
  voiceDetails: {
    flex: 1,
    minWidth: 0,
  },
  voiceHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  voiceTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  voiceTime: {
    color: colors.textMuted,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  voiceProgressTrack: {
    backgroundColor: 'rgba(243, 247, 252, 0.18)',
    borderRadius: 2,
    height: 4,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  voiceProgressValue: {
    backgroundColor: colors.primary,
    borderRadius: 2,
    height: '100%',
  },
  voiceError: {
    color: colors.danger,
    fontSize: 12,
    marginTop: 5,
  },
  videoNoteCard: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
  },
  videoNoteCardPending: {
    opacity: 0.7,
  },
  videoNoteCircle: {
    alignItems: 'center',
    backgroundColor: colors.canvasMuted,
    borderColor: colors.primary,
    borderRadius: 82,
    borderWidth: 2,
    height: 164,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 164,
  },
  videoNoteDuration: {
    backgroundColor: 'rgba(9, 18, 31, 0.72)',
    borderRadius: 9,
    bottom: spacing.sm,
    color: colors.text,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    position: 'absolute',
  },
  videoNoteLabel: {
    color: colors.textMuted,
    fontSize: 12,
  },
  videoNoteError: {
    color: colors.danger,
    fontSize: 12,
    maxWidth: 164,
    textAlign: 'center',
  },
  attachmentPressed: {
    opacity: 0.76,
  },
});
