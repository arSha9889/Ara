import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSupportedMediaRecorder,
  mediaFileExtension,
  RECORDING_OPTIONS,
} from './useMediaRecorder.js';

test('выбирает первый поддерживаемый MIME для записи', () => {
  const previous = globalThis.MediaRecorder;
  const calls = [];
  globalThis.MediaRecorder = class MediaRecorderMock {
    static isTypeSupported(value) {
      return value === 'audio/ogg;codecs=opus';
    }

    constructor(stream, options) {
      calls.push({ stream, options });
    }
  };

  try {
    const stream = { id: 'stream' };
    createSupportedMediaRecorder(stream, RECORDING_OPTIONS.voice.mimeTypes);
    assert.deepEqual(calls, [{ stream, options: { mimeType: 'audio/ogg;codecs=opus' } }]);
  } finally {
    globalThis.MediaRecorder = previous;
  }
});

test('использует MIME браузера по умолчанию, если ни один кандидат не поддержан', () => {
  const previous = globalThis.MediaRecorder;
  const calls = [];
  globalThis.MediaRecorder = class MediaRecorderMock {
    static isTypeSupported() {
      return false;
    }

    constructor(stream, options) {
      calls.push({ stream, options });
    }
  };

  try {
    const stream = { id: 'stream' };
    createSupportedMediaRecorder(stream, RECORDING_OPTIONS.video_note.mimeTypes);
    assert.deepEqual(calls, [{ stream, options: undefined }]);
  } finally {
    globalThis.MediaRecorder = previous;
  }
});

test('подбирает расширения для распространённых записанных форматов', () => {
  assert.equal(mediaFileExtension('audio/mp4;codecs=mp4a.40.2', 'webm'), 'm4a');
  assert.equal(mediaFileExtension('audio/ogg;codecs=opus', 'webm'), 'ogg');
  assert.equal(mediaFileExtension('video/webm', 'webm'), 'webm');
  assert.equal(mediaFileExtension('video/mp4', 'webm'), 'mp4');
});
