import type { ActiveDirectCall } from './callPresentation';

type CallActivityListener = (hasActiveCall: boolean) => void;

const listeners = new Set<CallActivityListener>();
let hasActiveCall = false;

export function setCallLifecycle(call: Pick<ActiveDirectCall, 'phase'> | null): void {
  const nextHasActiveCall = Boolean(call && call.phase !== 'failed');
  if (nextHasActiveCall === hasActiveCall) {
    return;
  }

  hasActiveCall = nextHasActiveCall;
  listeners.forEach(listener => listener(hasActiveCall));
}

export function isCallActive(): boolean {
  return hasActiveCall;
}

export function shouldKeepRealtimeConnection(appState: string | null | undefined): boolean {
  return hasActiveCall || appState === 'active' || appState === 'unknown';
}

export function subscribeToCallLifecycle(listener: CallActivityListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
