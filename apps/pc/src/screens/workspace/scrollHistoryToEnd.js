export function scrollHistoryToEnd(historyElement) {
  if (!historyElement) return;

  if (typeof historyElement.scrollTo === 'function') {
    historyElement.scrollTo({ top: historyElement.scrollHeight, behavior: 'auto' });
    return;
  }

  historyElement.scrollTop = historyElement.scrollHeight;
}
