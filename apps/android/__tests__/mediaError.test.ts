import { videoNoteRecordingErrorKey } from '../src/features/chats/media/mediaError';

test.each([
  ['VIDEO_NOTE_UNAVAILABLE', 'videoNoteCameraUnavailable'],
  ['VIDEO_NOTE_RECORDING_FAILED', 'videoNoteResultMissing'],
  ['INVALID_RECORDING_DURATION', 'videoNoteDurationUnavailable'],
  ['ATTACHMENT_TOO_LARGE', 'videoNoteTooLarge'],
  ['UNRECOGNIZED_CODE', 'videoNoteRecordError'],
])('maps native video-note error %s to %s', (code, key) => {
  expect(videoNoteRecordingErrorKey({ code })).toBe(key);
});
