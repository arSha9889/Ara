export interface MobilePushOpen {
  kind: 'message';
  notificationId: string;
  chatId: string;
  messageId?: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function uuid(value: unknown): string | null {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : null;
}

function optionalUuid(value: unknown): string | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  return uuid(value);
}

export function parseMobilePushOpen(value: unknown): MobilePushOpen | null {
  if (!isRecord(value)) {
    return null;
  }

  const notificationId = uuid(value.notification_id);
  const chatId = uuid(value.chat_id);
  if (value.kind !== 'message' || !notificationId || !chatId) {
    return null;
  }

  const messageId = optionalUuid(value.message_id);
  if (messageId === null) {
    return null;
  }

  return { kind: 'message', notificationId, chatId, messageId };
}
