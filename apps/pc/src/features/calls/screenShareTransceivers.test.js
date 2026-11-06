import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mediaMidsForTransceivers,
  mediaTransceiversForOffer,
  needsRenegotiationForTrack,
} from './screenShareTransceivers.js';

function transceiver(mid, kind) {
  return { mid, receiver: { track: { kind } } };
}

test('передаёт mid камеры и выделенных дорожек демонстрации экрана', () => {
  assert.deepEqual(mediaMidsForTransceivers({
    camera_video: transceiver('1', 'video'),
    screen_video: transceiver('2', 'video'),
    screen_audio: transceiver('3', 'audio'),
  }), {
    camera_video: '1',
    screen_video: '2',
    screen_audio: '3',
  });
});

test('находит экран и камеру по mid из предложения независимо от порядка дорожек', () => {
  const screenVideo = transceiver('screen-video', 'video');
  const cameraVideo = transceiver('camera-video', 'video');
  const screenAudio = transceiver('screen-audio', 'audio');
  const transceivers = [
    transceiver('microphone', 'audio'),
    screenVideo,
    cameraVideo,
    screenAudio,
  ];

  assert.deepEqual(mediaTransceiversForOffer(transceivers, {
    camera_video: 'camera-video',
    screen_video: 'screen-video',
    screen_audio: 'screen-audio',
  }), { cameraVideo, screenVideo, screenAudio });
});

test('пересогласовывает медиалинию только когда она не может отправлять поток', () => {
  assert.equal(needsRenegotiationForTrack({ currentDirection: 'sendrecv' }), false);
  assert.equal(needsRenegotiationForTrack({ currentDirection: 'sendonly' }), false);
  assert.equal(needsRenegotiationForTrack({ currentDirection: 'recvonly' }), true);
  assert.equal(needsRenegotiationForTrack({ direction: 'inactive' }), true);
});
