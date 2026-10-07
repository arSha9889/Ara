import {
  callFailureKeyForReason,
  callPhaseKey,
} from '../src/features/calls/callPresentation';

test('uses the camera-and-microphone status while preparing a video call', () => {
  expect(callPhaseKey({ callType: 'video', phase: 'requestingMicrophone' }))
    .toBe('callRequestingCameraAndMicrophone');
  expect(callPhaseKey({ callType: 'audio', phase: 'requestingMicrophone' }))
    .toBe('callRequestingMicrophone');
});

test('maps an unsupported remote media type to a visible call failure', () => {
  expect(callFailureKeyForReason('unsupported_media')).toBe('callUnavailable');
});
