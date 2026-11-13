import assert from 'node:assert/strict';
import test from 'node:test';

import { downloadProgressPercent } from './updateProgress.js';

test('рассчитывает процент загрузки и ограничивает его допустимым диапазоном', () => {
  assert.equal(downloadProgressPercent(0, 200), 0);
  assert.equal(downloadProgressPercent(101, 200), 51);
  assert.equal(downloadProgressPercent(300, 200), 100);
  assert.equal(downloadProgressPercent(-10, 200), 0);
});

test('не показывает недостоверный процент без размера файла', () => {
  assert.equal(downloadProgressPercent(20, 0), null);
  assert.equal(downloadProgressPercent(20, Number.NaN), null);
  assert.equal(downloadProgressPercent(Number.NaN, 100), null);
});
