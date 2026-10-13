const TARGET_KINDS = new Set(['message', 'announcement', 'support', 'system']);

function stringValue(value) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function targetSource(notification) {
  if (!notification || typeof notification !== 'object') return null;
  if (notification.target && typeof notification.target === 'object') return notification.target;
  return notification;
}

export function notificationTarget(notification) {
  const source = targetSource(notification);
  if (!source || !TARGET_KINDS.has(source.kind)) return null;

  const chatId = stringValue(source.chat_id);
  const messageId = stringValue(source.message_id);
  const supportTicketId = stringValue(source.support_ticket_id);

  if ((source.kind === 'message' || source.kind === 'announcement') && chatId) {
    return { kind: source.kind, chat_id: chatId, message_id: messageId };
  }
  if (source.kind === 'support' && supportTicketId) {
    return { kind: source.kind, support_ticket_id: supportTicketId };
  }
  if (source.kind === 'system' && source.section === 'settings') {
    return { kind: source.kind, section: 'settings' };
  }
  return null;
}

export function notificationId(notification) {
  return stringValue(notification?.notification_id) || stringValue(notification?.id);
}

