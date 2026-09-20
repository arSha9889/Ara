import { NativeEventEmitter, NativeModules } from 'react-native';

export type CallAudioRouteKind = 'earpiece' | 'speaker' | 'wired' | 'bluetooth';

export interface CallAudioRoute {
  id: string;
  kind: CallAudioRouteKind;
}

export interface CallAudioSession {
  routes: CallAudioRoute[];
  selectedRouteId: string | null;
}

export type CallAudioEvent = 'focusLost' | 'routesChanged';

interface NativeCallAudioModule {
  addListener(eventName: string): void;
  getCallAudioSession?(): Promise<unknown>;
  removeListeners(count: number): void;
  selectCallAudioRoute?(routeId: string): Promise<unknown>;
  startCallAudioSession?(): Promise<unknown>;
  stopCallAudioSession?(): Promise<void>;
}

const ROUTE_KINDS = new Set<CallAudioRouteKind>([
  'earpiece',
  'speaker',
  'wired',
  'bluetooth',
]);
const EMPTY_CALL_AUDIO_SESSION: CallAudioSession = { routes: [], selectedRouteId: null };
const nativeCallAudio = NativeModules.AraChatCallAudio as NativeCallAudioModule | undefined;
const nativeCallAudioEvents = nativeCallAudio ? new NativeEventEmitter(nativeCallAudio) : null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseRoute(value: unknown): CallAudioRoute | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !ROUTE_KINDS.has(value.kind as CallAudioRouteKind)) {
    return null;
  }

  return { id: value.id, kind: value.kind as CallAudioRouteKind };
}

export function parseCallAudioSession(value: unknown): CallAudioSession {
  if (!isRecord(value) || !Array.isArray(value.routes)) {
    return EMPTY_CALL_AUDIO_SESSION;
  }

  const routes = value.routes
    .map(parseRoute)
    .filter((route): route is CallAudioRoute => route !== null);
  const selectedRouteId = typeof value.selectedRouteId === 'string' ? value.selectedRouteId : null;

  return { routes, selectedRouteId };
}

export function parseCallAudioEvent(value: unknown): CallAudioEvent | null {
  if (!isRecord(value) || (value.type !== 'focusLost' && value.type !== 'routesChanged')) {
    return null;
  }

  return value.type;
}

export async function startCallAudioSession(): Promise<CallAudioSession> {
  if (!nativeCallAudio?.startCallAudioSession) {
    return EMPTY_CALL_AUDIO_SESSION;
  }

  return parseCallAudioSession(await nativeCallAudio.startCallAudioSession());
}

export async function getCallAudioSession(): Promise<CallAudioSession> {
  if (!nativeCallAudio?.getCallAudioSession) {
    return EMPTY_CALL_AUDIO_SESSION;
  }

  return parseCallAudioSession(await nativeCallAudio.getCallAudioSession());
}

export async function selectCallAudioRoute(routeId: string): Promise<CallAudioSession> {
  if (!nativeCallAudio?.selectCallAudioRoute || !routeId) {
    return EMPTY_CALL_AUDIO_SESSION;
  }

  return parseCallAudioSession(await nativeCallAudio.selectCallAudioRoute(routeId));
}

export async function stopCallAudioSession(): Promise<void> {
  await nativeCallAudio?.stopCallAudioSession?.();
}

export function subscribeToCallAudioEvents(listener: (event: CallAudioEvent) => void): () => void {
  if (!nativeCallAudioEvents) {
    return () => undefined;
  }

  const subscription = nativeCallAudioEvents.addListener('AraChatCallAudioEvent', (value: unknown) => {
    const event = parseCallAudioEvent(value);
    if (event) {
      listener(event);
    }
  });
  return () => subscription.remove();
}
