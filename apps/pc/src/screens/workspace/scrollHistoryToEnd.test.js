import assert from 'node:assert/strict';
import test from 'node:test';

import { scrollHistoryToEnd } from './scrollHistoryToEnd.js';

test('прокручивает историю к последнему сообщению через scrollTo', () => {
  let options = null;
  scrollHistoryToEnd({
    scrollHeight: 840,
    scrollTo: (nextOptions) => {
      options = nextOptions;
    },
  });

  assert.deepEqual(options, { top: 840, behavior: 'auto' });
});

test('использует scrollTop, если scrollTo недоступен', () => {
  const historyElement = { scrollHeight: 840, scrollTop: 0 };
  scrollHistoryToEnd(historyElement);

  assert.equal(historyElement.scrollTop, 840);
});

test('безопасно обрабатывает отсутствующий контейнер истории', () => {
  assert.doesNotThrow(() => scrollHistoryToEnd(null));
});
