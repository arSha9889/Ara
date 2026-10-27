import assert from 'node:assert/strict';
import test from 'node:test';

import { dataUrlForBlob } from './dataUrl.js';

test('создаёт data URL с MIME-типом и байтами Blob', async () => {
  const value = await dataUrlForBlob(new Blob(['voice'], { type: 'audio/webm' }));

  assert.equal(value, 'data:audio/webm;base64,dm9pY2U=');
});

test('использует безопасный MIME-тип, когда Blob не указывает свой', async () => {
  const value = await dataUrlForBlob(new Blob(['x']));

  assert.equal(value, 'data:application/octet-stream;base64,eA==');
});
