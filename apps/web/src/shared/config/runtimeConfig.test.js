import assert from 'node:assert/strict';
import test from 'node:test';

import { safeHttpsUrl } from './runtimeConfig.js';

test('accepts a plain HTTPS release URL', () => {
  assert.equal(
    safeHttpsUrl(' https://downloads.example.test/AraChat_0.1.5_x64-setup.exe '),
    'https://downloads.example.test/AraChat_0.1.5_x64-setup.exe',
  );
});

test('rejects unsafe or ambiguous release URLs', () => {
  for (const value of [
    '',
    'http://downloads.example.test/AraChat.exe',
    'https://token@downloads.example.test/AraChat.exe',
    'https://downloads.example.test/AraChat.exe?token=secret',
    'https://downloads.example.test/AraChat.exe#download',
    'javascript:alert(1)',
  ]) {
    assert.equal(safeHttpsUrl(value), '');
  }
});
