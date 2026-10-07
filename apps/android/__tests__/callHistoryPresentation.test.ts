import type { TranslationKey } from '../src/localization/messages';
import type { CallHistoryItem } from '../src/features/calls/api/callApi';
import {
  callOutcomeKey,
  callSummary,
  groupCallHistory,
  mergeCallHistoryItem,
} from '../src/features/calls/callHistoryPresentation';

const t = (key: TranslationKey): string => key;

function localTimestamp(year: number, month: number, day: number, hour: number, minute = 0, second = 0): string {
  return new Date(year, month, day, hour, minute, second).toISOString();
}

function call(overrides: Partial<CallHistoryItem> = {}): CallHistoryItem {
  return {
    call_id: 'call-1',
    call_type: 'audio',
    chat_id: 'chat-1',
    connected_at: localTimestamp(2026, 0, 10, 8),
    direction: 'outgoing',
    duration_seconds: 65,
    ended_at: localTimestamp(2026, 0, 10, 8, 1, 5),
    id: 'history-1',
    outcome: 'completed',
    peer: {
      avatar_ref: 'animal-01',
      avatar_type: 'built_in',
      display_name: 'Мария',
      id: 'user-2',
      is_official: false,
      username: 'maria',
    },
    started_at: localTimestamp(2026, 0, 10, 7, 59),
    ...overrides,
  };
}

test('groups consecutive calls by their local end date', () => {
  const earlier = call({ call_id: 'call-2', ended_at: localTimestamp(2026, 0, 9, 8, 1, 5), id: 'history-2' });
  const items = groupCallHistory([call(), call({ call_id: 'call-3', id: 'history-3' }), earlier], 'ru', t);

  expect(items.map(item => item.id)).toEqual([
    'day:2026-0-10',
    'history-1',
    'history-3',
    'day:2026-0-9',
    'history-2',
  ]);
});

test('replaces a realtime history item and keeps the newest call first', () => {
  const existing = call({ ended_at: localTimestamp(2026, 0, 10, 8, 1, 5) });
  const refreshed = call({ duration_seconds: 70, ended_at: localTimestamp(2026, 0, 10, 8, 2) });
  const newest = call({ call_id: 'call-2', ended_at: localTimestamp(2026, 0, 10, 8, 3), id: 'history-2' });

  expect(mergeCallHistoryItem([existing, newest], refreshed)).toEqual([newest, refreshed]);
});

test('uses the viewer perspective for terminal outcomes and formats completed calls', () => {
  expect(callSummary(call(), t)).toBe('callOutgoing · callAudio · 01:05');
  expect(callOutcomeKey('cancelled', 'incoming')).toBe('callMissed');
  expect(callOutcomeKey('rejected', 'outgoing')).toBe('callRejected');
  expect(callOutcomeKey('busy', 'incoming')).toBe('callBusy');
  expect(callOutcomeKey('failed', 'outgoing')).toBe('callConnectionFailed');
});
