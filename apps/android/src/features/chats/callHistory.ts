export type CallHistoryType = 'audio' | 'video';
export type CallHistoryOutcome = 'cancelled' | 'rejected';

export interface CallHistoryEvent {
  callId: string;
  callType: CallHistoryType;
  outcome: CallHistoryOutcome;
}

export type CallHistoryStatusKey =
  | 'callNoAnswer'
  | 'callMissed'
  | 'callRejected'
  | 'callDeclined';

export function parseCallHistoryEvent(payload: string): CallHistoryEvent | null {
  try {
    const value: unknown = JSON.parse(payload);
    if (!value || typeof value !== 'object') {
      return null;
    }

    const { call_id: callId, call_type: callType, outcome, version } = value as Record<string, unknown>;
    if (
      version !== 1 ||
      typeof callId !== 'string' ||
      !callId ||
      (callType !== 'audio' && callType !== 'video') ||
      (outcome !== 'cancelled' && outcome !== 'rejected')
    ) {
      return null;
    }

    return { callId, callType, outcome };
  } catch {
    return null;
  }
}

export function callHistoryStatusKey(
  event: CallHistoryEvent,
  isCaller: boolean,
): CallHistoryStatusKey {
  if (event.outcome === 'cancelled') {
    return isCaller ? 'callNoAnswer' : 'callMissed';
  }

  return isCaller ? 'callRejected' : 'callDeclined';
}
