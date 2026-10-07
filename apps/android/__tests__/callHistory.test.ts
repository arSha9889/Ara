import {
  callHistoryStatusKey,
  parseCallHistoryEvent,
} from '../src/features/chats/callHistory';

test('parses a versioned call history payload', () => {
  expect(parseCallHistoryEvent(
    '{"version":1,"call_id":"call-123","call_type":"video","outcome":"rejected"}',
  )).toEqual({
    callId: 'call-123',
    callType: 'video',
    outcome: 'rejected',
  });
});

test('rejects malformed or unsupported call history payloads', () => {
  expect(parseCallHistoryEvent('not-json')).toBeNull();
  expect(parseCallHistoryEvent('{"version":1,"call_type":"audio","outcome":"connected"}')).toBeNull();
});

test('selects the status from the viewer perspective', () => {
  const cancelled = parseCallHistoryEvent(
    '{"version":1,"call_id":"call-123","call_type":"audio","outcome":"cancelled"}',
  );
  const rejected = parseCallHistoryEvent(
    '{"version":1,"call_id":"call-456","call_type":"video","outcome":"rejected"}',
  );

  expect(cancelled && callHistoryStatusKey(cancelled, true)).toBe('callNoAnswer');
  expect(cancelled && callHistoryStatusKey(cancelled, false)).toBe('callMissed');
  expect(rejected && callHistoryStatusKey(rejected, true)).toBe('callRejected');
  expect(rejected && callHistoryStatusKey(rejected, false)).toBe('callDeclined');
});
