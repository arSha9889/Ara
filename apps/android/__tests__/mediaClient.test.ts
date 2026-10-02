jest.mock('react-native', () => ({
  NativeModules: {
    AraChatMedia: {
      downloadPrivateMedia: jest.fn(),
      pickPhoto: jest.fn(),
      pickVideo: jest.fn(),
      playCachedVideo: jest.fn(),
      playCachedVideoNote: jest.fn(),
      recordVideoNote: jest.fn(),
      startVoiceRecording: jest.fn(),
      stopVoiceRecording: jest.fn(),
      toggleCachedAudioPlayback: jest.fn(),
    },
  },
}));

jest.mock('../src/config/runtimeConfig', () => ({
  getApiBaseUrl: () => 'https://api.example.test',
}));

jest.mock('../src/infrastructure/http/apiClient', () => ({
  apiClient: { withAuthRetry: jest.fn() },
}));

import { NativeModules } from 'react-native';

import { apiClient } from '../src/infrastructure/http/apiClient';
import {
  downloadPrivateChatMedia,
  pickChatPhoto,
  pickChatVideo,
  playCachedChatVideoNote,
  playCachedChatVideo,
  recordChatVideoNote,
  startChatVoiceRecording,
  stopChatVoiceRecording,
  toggleCachedChatAudioPlayback,
} from '../src/features/chats/media/mediaClient';

const nativeMedia = NativeModules.AraChatMedia as {
  downloadPrivateMedia: jest.Mock;
  pickPhoto: jest.Mock;
  pickVideo: jest.Mock;
  playCachedVideo: jest.Mock;
  playCachedVideoNote: jest.Mock;
  recordVideoNote: jest.Mock;
  startVoiceRecording: jest.Mock;
  stopVoiceRecording: jest.Mock;
  toggleCachedAudioPlayback: jest.Mock;
};
const withAuthRetry = apiClient.withAuthRetry as jest.Mock;

beforeEach(() => {
  nativeMedia.downloadPrivateMedia.mockReset();
  nativeMedia.pickPhoto.mockReset();
  nativeMedia.pickVideo.mockReset();
  nativeMedia.playCachedVideo.mockReset();
  nativeMedia.playCachedVideoNote.mockReset();
  nativeMedia.recordVideoNote.mockReset();
  nativeMedia.startVoiceRecording.mockReset();
  nativeMedia.stopVoiceRecording.mockReset();
  nativeMedia.toggleCachedAudioPlayback.mockReset();
  withAuthRetry.mockReset();
});

test('reads a selected video from the native picker draft', async () => {
  nativeMedia.pickVideo.mockResolvedValue({
    uri: 'file:///cache/arachat-media/drafts/video.mp4',
    name: 'video.mp4',
    mimeType: 'video/mp4',
    sizeBytes: 4_096,
  });

  await expect(pickChatVideo()).resolves.toEqual({
    uri: 'file:///cache/arachat-media/drafts/video.mp4',
    name: 'video.mp4',
    mimeType: 'video/mp4',
    sizeBytes: 4_096,
  });
});

test('reads a selected photo from the native photo picker draft', async () => {
  nativeMedia.pickPhoto.mockResolvedValue({
    uri: 'file:///cache/arachat-media/drafts/photo.jpg',
    name: 'photo.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 2_048,
  });

  await expect(pickChatPhoto()).resolves.toEqual({
    uri: 'file:///cache/arachat-media/drafts/photo.jpg',
    name: 'photo.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 2_048,
  });
});

test('downloads video into the private cache with an authorization argument, not a tokenized URL', async () => {
  const mediaPath = '/api/media/45543f5f-c86d-4af2-a14e-d786ff211a6c';
  withAuthRetry.mockImplementation(operation => operation('private-access-token'));
  nativeMedia.downloadPrivateMedia.mockResolvedValue('file:///cache/arachat-media/downloads/video.mp4');

  await expect(downloadPrivateChatMedia(mediaPath, 'video/mp4')).resolves.toBe(
    'file:///cache/arachat-media/downloads/video.mp4',
  );

  expect(nativeMedia.downloadPrivateMedia).toHaveBeenCalledWith(
    mediaPath,
    'https://api.example.test',
    'private-access-token',
    'video/mp4',
  );
  expect(mediaPath).not.toContain('private-access-token');
});

test('passes only a locally cached video URI to the native player', async () => {
  nativeMedia.playCachedVideo.mockResolvedValue(undefined);

  await playCachedChatVideo('file:///cache/arachat-media/downloads/video.mp4', 'video/mp4');

  expect(nativeMedia.playCachedVideo).toHaveBeenCalledWith(
    'file:///cache/arachat-media/downloads/video.mp4',
    'video/mp4',
  );
});

test('keeps voice recordings in a private draft with an explicit message type and duration', async () => {
  nativeMedia.startVoiceRecording.mockResolvedValue(undefined);
  nativeMedia.stopVoiceRecording.mockResolvedValue({
    uri: 'file:///cache/arachat-media/drafts/voice.m4a',
    name: 'voice.m4a',
    mimeType: 'audio/mp4',
    sizeBytes: 4_096,
    messageType: 'voice',
    durationSeconds: 7,
  });

  await startChatVoiceRecording();
  await expect(stopChatVoiceRecording()).resolves.toEqual({
    uri: 'file:///cache/arachat-media/drafts/voice.m4a',
    name: 'voice.m4a',
    mimeType: 'audio/mp4',
    sizeBytes: 4_096,
    messageType: 'voice',
    durationSeconds: 7,
  });
  expect(nativeMedia.startVoiceRecording).toHaveBeenCalledWith();
  expect(nativeMedia.stopVoiceRecording).toHaveBeenCalledWith();
});

test('rejects a voice draft that does not provide a positive duration', async () => {
  nativeMedia.stopVoiceRecording.mockResolvedValue({
    uri: 'file:///cache/arachat-media/drafts/voice.m4a',
    name: 'voice.m4a',
    mimeType: 'audio/mp4',
    sizeBytes: 4_096,
    messageType: 'voice',
  });

  await expect(stopChatVoiceRecording()).rejects.toThrow('некорректный формат');
});

test('uses only local cached paths for video-note and voice playback', async () => {
  nativeMedia.playCachedVideoNote.mockResolvedValue(undefined);
  nativeMedia.toggleCachedAudioPlayback.mockResolvedValue({
    isPlaying: true,
    positionSeconds: 1.2,
    durationSeconds: 7,
  });
  const videoUri = 'file:///cache/arachat-media/downloads/video-note.mp4';
  const audioUri = 'file:///cache/arachat-media/downloads/voice.m4a';

  await playCachedChatVideoNote(videoUri, 'video/mp4');
  await expect(toggleCachedChatAudioPlayback(audioUri, 'audio/mp4')).resolves.toEqual({
    isPlaying: true,
    positionSeconds: 1.2,
    durationSeconds: 7,
  });

  expect(nativeMedia.playCachedVideoNote).toHaveBeenCalledWith(videoUri, 'video/mp4');
  expect(nativeMedia.toggleCachedAudioPlayback).toHaveBeenCalledWith(audioUri, 'audio/mp4');
});

test('reads a recorded video note as a dedicated message type', async () => {
  nativeMedia.recordVideoNote.mockResolvedValue({
    uri: 'file:///cache/arachat-media/drafts/video-note.mp4',
    name: 'video-note.mp4',
    mimeType: 'video/mp4',
    sizeBytes: 8_192,
    messageType: 'video_note',
    durationSeconds: 12,
  });

  await expect(recordChatVideoNote()).resolves.toMatchObject({
    messageType: 'video_note',
    durationSeconds: 12,
  });
});
