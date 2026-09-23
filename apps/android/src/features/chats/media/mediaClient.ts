import { NativeModules } from 'react-native';

import { getApiBaseUrl } from '../../../config/runtimeConfig';
import { apiClient } from '../../../infrastructure/http/apiClient';

export interface PickedChatAttachment {
  uri: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  messageType?: 'voice' | 'video_note';
  durationSeconds?: number;
}

export interface AudioPlaybackState {
  isPlaying: boolean;
  positionSeconds: number;
  durationSeconds: number;
}

interface NativeMediaModule {
  cancelVoiceRecording?: () => Promise<void>;
  clearPrivateMediaCache?: () => Promise<void>;
  discardDraft?: (fileUri: string) => Promise<void>;
  downloadPrivateMedia?: (
    mediaPath: string,
    apiBaseUrl: string,
    accessToken: string,
    mimeType: string,
  ) => Promise<unknown>;
  openCachedMedia?: (fileUri: string, mimeType: string) => Promise<void>;
  pickVideo?: () => Promise<unknown>;
  playCachedVideoNote?: (fileUri: string, mimeType: string) => Promise<void>;
  playCachedVideo?: (fileUri: string, mimeType: string) => Promise<void>;
  pickDocument?: () => Promise<unknown>;
  pickPhoto?: () => Promise<unknown>;
  recordVideoNote?: () => Promise<unknown>;
  startVoiceRecording?: () => Promise<void>;
  stopCachedAudioPlayback?: (fileUri: string) => Promise<void>;
  stopVoiceRecording?: () => Promise<unknown>;
  getCachedAudioPlaybackState?: (fileUri: string) => Promise<unknown>;
  toggleCachedAudioPlayback?: (fileUri: string, mimeType: string) => Promise<unknown>;
}

const nativeMedia = NativeModules.AraChatMedia as NativeMediaModule | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parsePickedAttachment(value: unknown): PickedChatAttachment | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (
    !isRecord(value) ||
    typeof value.uri !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.mimeType !== 'string' ||
    typeof value.sizeBytes !== 'number' ||
    !value.uri.startsWith('file://') ||
    !value.name.trim() ||
    !value.mimeType.includes('/') ||
    !Number.isFinite(value.sizeBytes) ||
    value.sizeBytes <= 0
  ) {
    throw new Error('Выбранное вложение имеет некорректный формат.');
  }

  const messageType = value.messageType;
  const durationSeconds = value.durationSeconds;
  if (
    (messageType !== undefined && messageType !== 'voice' && messageType !== 'video_note') ||
    (durationSeconds !== undefined &&
      (typeof durationSeconds !== 'number' ||
        !Number.isInteger(durationSeconds) ||
        durationSeconds <= 0)) ||
    ((messageType === undefined) !== (durationSeconds === undefined))
  ) {
    throw new Error('Записанное сообщение имеет некорректный формат.');
  }

  return {
    uri: value.uri,
    name: value.name,
    mimeType: value.mimeType,
    sizeBytes: value.sizeBytes,
    ...(messageType === 'voice' || messageType === 'video_note' ? { messageType } : {}),
    ...(typeof durationSeconds === 'number' ? { durationSeconds } : {}),
  };
}

function parseAudioPlaybackState(value: unknown): AudioPlaybackState {
  if (
    !isRecord(value) ||
    typeof value.isPlaying !== 'boolean' ||
    typeof value.positionSeconds !== 'number' ||
    typeof value.durationSeconds !== 'number' ||
    !Number.isFinite(value.positionSeconds) ||
    !Number.isFinite(value.durationSeconds) ||
    value.positionSeconds < 0 ||
    value.durationSeconds < 0
  ) {
    throw new Error('Не удалось получить состояние воспроизведения голосового сообщения.');
  }

  return {
    isPlaying: value.isPlaying,
    positionSeconds: value.positionSeconds,
    durationSeconds: value.durationSeconds,
  };
}

function parseCachedMediaUri(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('file://')) {
    throw new Error('Не удалось сохранить вложение в защищённый кэш.');
  }
  return value;
}

function nativeModuleOrThrow(): NativeMediaModule {
  if (!nativeMedia) {
    throw new Error('Модуль вложений недоступен в этой сборке приложения.');
  }
  return nativeMedia;
}

export async function pickChatPhoto(): Promise<PickedChatAttachment | null> {
  const result = await nativeModuleOrThrow().pickPhoto?.();
  return parsePickedAttachment(result);
}

export async function pickChatDocument(): Promise<PickedChatAttachment | null> {
  const result = await nativeModuleOrThrow().pickDocument?.();
  return parsePickedAttachment(result);
}

export async function pickChatVideo(): Promise<PickedChatAttachment | null> {
  const result = await nativeModuleOrThrow().pickVideo?.();
  return parsePickedAttachment(result);
}

export async function startChatVoiceRecording(): Promise<void> {
  const module = nativeModuleOrThrow();
  if (!module.startVoiceRecording) {
    throw new Error('Запись голосовых сообщений недоступна в этой сборке приложения.');
  }
  await module.startVoiceRecording();
}

export async function stopChatVoiceRecording(): Promise<PickedChatAttachment> {
  const module = nativeModuleOrThrow();
  if (!module.stopVoiceRecording) {
    throw new Error('Запись голосовых сообщений недоступна в этой сборке приложения.');
  }
  const attachment = parsePickedAttachment(await module.stopVoiceRecording());
  if (attachment?.messageType !== 'voice' || !attachment.durationSeconds) {
    throw new Error('Не удалось сохранить голосовое сообщение.');
  }
  return attachment;
}

export async function cancelChatVoiceRecording(): Promise<void> {
  await nativeMedia?.cancelVoiceRecording?.();
}

export async function recordChatVideoNote(): Promise<PickedChatAttachment | null> {
  const module = nativeModuleOrThrow();
  if (!module.recordVideoNote) {
    throw new Error('Запись видеосообщений недоступна в этой сборке приложения.');
  }
  const attachment = parsePickedAttachment(await module.recordVideoNote());
  if (attachment && (attachment.messageType !== 'video_note' || !attachment.durationSeconds)) {
    throw new Error('Не удалось сохранить видеосообщение.');
  }
  return attachment;
}

export async function discardChatAttachmentDraft(uri: string): Promise<void> {
  await nativeMedia?.discardDraft?.(uri);
}

export async function downloadPrivateChatMedia(
  mediaPath: string,
  mimeType: string,
): Promise<string> {
  const module = nativeModuleOrThrow();
  if (!module.downloadPrivateMedia) {
    throw new Error('Модуль защищённых вложений недоступен в этой сборке приложения.');
  }

  return apiClient.withAuthRetry(async accessToken =>
    parseCachedMediaUri(
      await module.downloadPrivateMedia?.(
        mediaPath,
        getApiBaseUrl(),
        accessToken,
        mimeType,
      ),
    ),
  );
}

export async function openCachedChatMedia(uri: string, mimeType: string): Promise<void> {
  const module = nativeModuleOrThrow();
  if (!module.openCachedMedia) {
    throw new Error('Модуль просмотра вложений недоступен в этой сборке приложения.');
  }
  await module.openCachedMedia(uri, mimeType);
}

export async function playCachedChatVideo(uri: string, mimeType: string): Promise<void> {
  const module = nativeModuleOrThrow();
  if (!module.playCachedVideo) {
    throw new Error('Модуль воспроизведения видео недоступен в этой сборке приложения.');
  }
  await module.playCachedVideo(uri, mimeType);
}

export async function playCachedChatVideoNote(uri: string, mimeType: string): Promise<void> {
  const module = nativeModuleOrThrow();
  if (!module.playCachedVideoNote) {
    throw new Error('Модуль воспроизведения видеосообщений недоступен в этой сборке приложения.');
  }
  await module.playCachedVideoNote(uri, mimeType);
}

export async function toggleCachedChatAudioPlayback(
  uri: string,
  mimeType: string,
): Promise<AudioPlaybackState> {
  const module = nativeModuleOrThrow();
  if (!module.toggleCachedAudioPlayback) {
    throw new Error('Модуль воспроизведения голосовых сообщений недоступен в этой сборке приложения.');
  }
  return parseAudioPlaybackState(await module.toggleCachedAudioPlayback(uri, mimeType));
}

export async function getCachedChatAudioPlaybackState(uri: string): Promise<AudioPlaybackState> {
  const module = nativeModuleOrThrow();
  if (!module.getCachedAudioPlaybackState) {
    throw new Error('Модуль воспроизведения голосовых сообщений недоступен в этой сборке приложения.');
  }
  return parseAudioPlaybackState(await module.getCachedAudioPlaybackState(uri));
}

export async function stopCachedChatAudioPlayback(uri: string): Promise<void> {
  await nativeMedia?.stopCachedAudioPlayback?.(uri);
}

export async function clearPrivateChatMediaCache(): Promise<void> {
  await nativeMedia?.clearPrivateMediaCache?.();
}
