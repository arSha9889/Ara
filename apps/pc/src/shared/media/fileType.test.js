import assert from 'node:assert/strict';
import test from 'node:test';

import { ACCEPTED_FILE_TYPES, mimeTypeForFile } from './fileType.js';

test('нормализует Windows MIME audio/mp3', () => {
  assert.equal(mimeTypeForFile({ name: 'track.mp3', type: 'audio/mp3' }), 'audio/mpeg');
});

test('определяет MIME по расширению, если Windows не передал тип', () => {
  assert.equal(mimeTypeForFile({ name: 'photo.JPG', type: '' }), 'image/jpeg');
  assert.equal(mimeTypeForFile({ name: 'movie.mp4', type: '' }), 'video/mp4');
  assert.equal(mimeTypeForFile({ name: 'track.M4A', type: '' }), 'audio/mp4');
});

test('оставляет неизвестные файлы безопасным бинарным типом', () => {
  assert.equal(mimeTypeForFile({ name: 'archive.bin', type: '' }), 'application/octet-stream');
});

test('file picker содержит расширения, поддерживаемые сервером', () => {
  assert.match(ACCEPTED_FILE_TYPES, /\.mp3/);
  assert.match(ACCEPTED_FILE_TYPES, /\.mp4/);
  assert.match(ACCEPTED_FILE_TYPES, /\.jpg/);
});
