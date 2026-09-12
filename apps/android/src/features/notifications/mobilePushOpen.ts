interface MobilePushOpenBase {
  notificationId: string;
  messageId?: string;
}

export type MobilePushOpen =
  | (MobilePushOpenBase & { kind: 'message'; chatId: string })
  | (MobilePushOpenBase & { kind: 'support'; supportTicketId: string })
  | (MobilePushOpenBase & { kind: 'announcement' | 'system' });

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

  const kind = value.kind;
  const notificationId = uuid(value.notification_id);
  if (
    (kind !== 'message' && kind !== 'announcement' && kind !== 'support' && kind !== 'system') ||
    !notificationId
  ) {
    return null;
  }

  const messageId = optionalUuid(value.message_id);
  if (messageId === null) {
    return null;
  }

  if (kind === 'message') {
    const chatId = uuid(value.chat_id);
    return chatId ? { kind, notificationId, chatId, messageId } : null;
  }

  if (kind === 'support') {
    const supportTicketId = uuid(value.support_ticket_id);
    return supportTicketId ? { kind, notificationId, messageId, supportTicketId } : null;
  }

  return { kind, notificationId, messageId };
}
