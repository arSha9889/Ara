import type { TranslationKey } from '../../../localization/messages';

function nativeErrorCode(error: unknown): string | null {
  if (
    !error ||
    typeof error !== 'object' ||
    !('code' in error) ||
    typeof error.code !== 'string'
  ) {
    return null;
  }

  return error.code;
}

export function videoNoteRecordingErrorKey(error: unknown): TranslationKey {
  switch (nativeErrorCode(error)) {
    case 'CAMERA_PERMISSION_DENIED':
    case 'VIDEO_NOTE_AUDIO_PERMISSION_DENIED':
      return 'videoNotePermissionDenied';
    case 'ACTIVITY_UNAVAILABLE':
    case 'VIDEO_NOTE_UNAVAILABLE':
      return 'videoNoteCameraUnavailable';
    case 'ATTACHMENT_EMPTY':
    case 'ATTACHMENT_READ_FAILED':
    case 'VIDEO_NOTE_RECORDING_FAILED':
      return 'videoNoteResultMissing';
    case 'INVALID_RECORDING_DURATION':
      return 'videoNoteDurationUnavailable';
    case 'ATTACHMENT_TOO_LARGE':
      return 'videoNoteTooLarge';
    default:
      return 'videoNoteRecordError';
  }
}
