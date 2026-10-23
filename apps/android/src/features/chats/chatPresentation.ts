import type { Chat, ChatPreviewMessage, GroupRole } from './api/chatApi';

export interface AttachmentPresentationCopy {
  attachment: string;
  file: string;
  photo: string;
  video: string;
  videoNote: string;
  voice: string;
}

export interface ChatPresentationCopy extends AttachmentPresentationCopy {
  call: string;
  directChat: string;
  groupChat: string;
  groupCreated: string;
  groupCreatedWithMembers: string;
  groupLifecycleFallback: string;
  groupMemberAdded: string;
  groupMemberJoined: string;
  groupMemberLeft: string;
  groupMemberRemoved: string;
  groupMemberRoleChanged: string;
  groupOwnershipTransferred: string;
  groupRoleAdmin: string;
  groupRoleMember: string;
  noMessages: string;
  savedMessages: string;
  youPrefix: string;
}

interface GroupLifecycleMember {
  displayName: string;
}

interface GroupLifecyclePayload {
  action:
    | 'group_created'
    | 'member_added'
    | 'member_joined'
    | 'member_left'
    | 'member_removed'
    | 'member_role_changed'
    | 'ownership_transferred';
  member?: GroupLifecycleMember;
  memberCount?: number;
  owner?: GroupLifecycleMember;
  role?: Exclude<GroupRole, 'owner'>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function lifecycleMember(value: unknown): GroupLifecycleMember | undefined {
  if (!isRecord(value) || typeof value.display_name !== 'string' || !value.display_name.trim()) {
    return undefined;
  }

  return { displayName: value.display_name.trim() };
}

export function parseGroupLifecyclePayload(payload: string): GroupLifecyclePayload | null {
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    return null;
  }

  if (!isRecord(value) || value.version !== 1 || !isRecord(value.data) || typeof value.action !== 'string') {
    return null;
  }

  const actions = new Set([
    'group_created',
    'member_added',
    'member_joined',
    'member_left',
    'member_removed',
    'member_role_changed',
    'ownership_transferred',
  ]);
  if (!actions.has(value.action)) {
    return null;
  }

  const memberCount = value.data.member_count;
  const role = value.data.role;
  return {
    action: value.action as GroupLifecyclePayload['action'],
    member: lifecycleMember(value.data.member),
    owner: lifecycleMember(value.data.owner),
    memberCount:
      typeof memberCount === 'number' && Number.isInteger(memberCount) && memberCount > 0
        ? memberCount
        : undefined,
    role: role === 'admin' || role === 'member' ? role : undefined,
  };
}

export function groupLifecycleText(
  payload: string,
  copy: Pick<
    ChatPresentationCopy,
    | 'groupCreated'
    | 'groupCreatedWithMembers'
    | 'groupLifecycleFallback'
    | 'groupMemberAdded'
    | 'groupMemberJoined'
    | 'groupMemberLeft'
    | 'groupMemberRemoved'
    | 'groupMemberRoleChanged'
    | 'groupOwnershipTransferred'
    | 'groupRoleAdmin'
    | 'groupRoleMember'
  >,
): string {
  const lifecycle = parseGroupLifecyclePayload(payload);
  if (!lifecycle) {
    return copy.groupLifecycleFallback;
  }

  const memberName = lifecycle.member?.displayName;
  switch (lifecycle.action) {
    case 'group_created':
      return lifecycle.memberCount
        ? `${copy.groupCreatedWithMembers}: ${lifecycle.memberCount}`
        : copy.groupCreated;
    case 'member_added':
      return memberName ? `${copy.groupMemberAdded}: ${memberName}` : copy.groupLifecycleFallback;
    case 'member_joined':
      return memberName ? `${copy.groupMemberJoined}: ${memberName}` : copy.groupLifecycleFallback;
    case 'member_left':
      return memberName ? `${copy.groupMemberLeft}: ${memberName}` : copy.groupLifecycleFallback;
    case 'member_removed':
      return memberName ? `${copy.groupMemberRemoved}: ${memberName}` : copy.groupLifecycleFallback;
    case 'member_role_changed':
      if (!memberName || !lifecycle.role) {
        return copy.groupLifecycleFallback;
      }
      return `${copy.groupMemberRoleChanged}: ${memberName} — ${
        lifecycle.role === 'admin' ? copy.groupRoleAdmin : copy.groupRoleMember
      }`;
    case 'ownership_transferred':
      return lifecycle.owner?.displayName
        ? `${copy.groupOwnershipTransferred}: ${lifecycle.owner.displayName}`
        : copy.groupLifecycleFallback;
  }
}

export function chatTitle(
  chat: Chat,
  copy: Pick<ChatPresentationCopy, 'directChat' | 'groupChat' | 'savedMessages'>,
): string {
  if (chat.type === 'saved') {
    return copy.savedMessages;
  }

  if (chat.type === 'group') {
    return chat.title?.trim() || copy.groupChat;
  }

  if (chat.peer?.display_name) {
    return chat.peer.display_name;
  }

  if (chat.peer?.username) {
    return `@${chat.peer.username}`;
  }

  return copy.directChat;
}

export function attachmentLabel(type: string, copy: AttachmentPresentationCopy): string {
  switch (type) {
    case 'photo':
      return copy.photo;
    case 'video':
      return copy.video;
    case 'voice':
      return copy.voice;
    case 'video_note':
      return copy.videoNote;
    case 'file':
      return copy.file;
    default:
      return copy.attachment;
  }
}

export function chatPreview(
  message: ChatPreviewMessage | null,
  currentUserId: string | undefined,
  copy: ChatPresentationCopy,
): string {
  if (!message) {
    return copy.noMessages;
  }

  const prefix = message.sender_id === currentUserId ? `${copy.youPrefix}: ` : '';
  const content =
    message.type === 'text' || message.type === 'emoji'
      ? message.payload
      : message.type === 'system'
        ? groupLifecycleText(message.payload, copy)
      : message.type === 'call'
        ? copy.call
        : attachmentLabel(message.type, copy);

  return `${prefix}${content}`;
}

export function formatConversationTime(value: string, language: 'ru' | 'en'): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
