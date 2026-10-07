import { NativeEventEmitter, NativeModules } from 'react-native';

import type { DirectCallType } from './callPresentation';

interface NativeCallForegroundModule {
  addListener(eventName: string): void;
  removeListeners(count: number): void;
  startCallForeground?(callType: DirectCallType, peerName: string): Promise<void>;
  stopCallForeground?(): Promise<void>;
}

interface PictureInPictureEvent {
  isInPictureInPicture: boolean;
}

const nativeCallForeground = NativeModules.AraChatCallForeground as NativeCallForegroundModule | undefined;
const nativeCallForegroundEvents = nativeCallForeground
  ? new NativeEventEmitter(nativeCallForeground)
  : null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parsePictureInPictureEvent(value: unknown): PictureInPictureEvent | null {
  if (!isRecord(value) || typeof value.isInPictureInPicture !== 'boolean') {
    return null;
  }

  return { isInPictureInPicture: value.isInPictureInPicture };
}

export async function startCallForeground(callType: DirectCallType, peerName: string): Promise<void> {
  await nativeCallForeground?.startCallForeground?.(callType, peerName.trim());
}

export async function stopCallForeground(): Promise<void> {
  await nativeCallForeground?.stopCallForeground?.();
}

export function subscribeToPictureInPicture(
  listener: (event: PictureInPictureEvent) => void,
): () => void {
  if (!nativeCallForegroundEvents) {
    return () => undefined;
  }

  const subscription = nativeCallForegroundEvents.addListener(
    'AraChatCallPresentationEvent',
    (value: unknown) => {
      const event = parsePictureInPictureEvent(value);
      if (event) {
        listener(event);
      }
    },
  );
  return () => subscription.remove();
}
