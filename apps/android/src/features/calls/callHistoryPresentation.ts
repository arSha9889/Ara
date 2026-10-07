import type { TranslationKey } from '../../localization/messages';

import type { CallHistoryItem, CallHistoryOutcome } from './api/callApi';
import { formatCallDuration } from './callPresentation';

export type CallHistoryListItem =
  | { id: string; kind: 'header'; label: string }
  | { call: CallHistoryItem; id: string; kind: 'call' };

export function groupCallHistory(
  history: CallHistoryItem[],
  language: 'ru' | 'en',
  t: (key: TranslationKey) => string,
): CallHistoryListItem[] {
  const groups = new Map<string, CallHistoryItem[]>();
  for (const item of history) {
    const key = localDateKey(item.ended_at);
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  return Array.from(groups.entries()).flatMap(([dateKey, calls]) => [
    { id: `day:${dateKey}`, kind: 'header' as const, label: formatDayHeader(dateKey, language, t) },
    ...calls.map(call => ({ call, id: call.id, kind: 'call' as const })),
  ]);
}

export function mergeCallHistoryItem(current: CallHistoryItem[], item: CallHistoryItem): CallHistoryItem[] {
  const next = current.filter(currentItem => currentItem.id !== item.id);
  next.push(item);
  return next.sort((first, second) => second.ended_at.localeCompare(first.ended_at));
}

export function callSummary(call: CallHistoryItem, t: (key: TranslationKey) => string): string {
  if (call.outcome === 'completed') {
    const direction = t(call.direction === 'incoming' ? 'callIncoming' : 'callOutgoing');
    const type = t(call.call_type === 'video' ? 'callVideo' : 'callAudio');
    const duration = call.duration_seconds === null ? '' : ` · ${formatCallDuration(call.duration_seconds)}`;
    return `${direction} · ${type}${duration}`;
  }

  return t(callOutcomeKey(call.outcome, call.direction));
}

export function callOutcomeKey(
  outcome: CallHistoryOutcome,
  direction: CallHistoryItem['direction'],
): TranslationKey {
  switch (outcome) {
    case 'cancelled':
      return direction === 'incoming' ? 'callMissed' : 'callNoAnswer';
    case 'rejected':
      return direction === 'incoming' ? 'callDeclined' : 'callRejected';
    case 'busy':
      return 'callBusy';
    case 'failed':
      return 'callConnectionFailed';
    case 'completed':
      return 'callCompleted';
  }
}

function localDateKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return [date.getFullYear(), date.getMonth(), date.getDate()].join('-');
}

function formatDayHeader(value: string, language: 'ru' | 'en', t: (key: TranslationKey) => string): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month, day);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameLocalDay(date, today)) {
    return t('callsToday');
  }
  if (sameLocalDay(date, yesterday)) {
    return t('callsYesterday');
  }

  return new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  }).format(date);
}

function sameLocalDay(first: Date, second: Date): boolean {
  return first.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth()
    && first.getDate() === second.getDate();
}
