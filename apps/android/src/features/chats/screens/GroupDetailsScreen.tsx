import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { RootStackParamList } from '../../../navigation/AppNavigator';
import { authErrorKey } from '../../auth/authError';
import { useSession } from '../../auth/session/useSession';
import { copyTextToClipboard } from '../../../infrastructure/device/clipboard';
import { ApiError } from '../../../infrastructure/http/apiClient';
import { useI18n } from '../../../localization/I18nProvider';
import { useRealtime } from '../../realtime/RealtimeProvider';
import { searchPublicUsers, type PublicUser } from '../../search/api/searchApi';
import { colors, sharedStyles, spacing } from '../../../theme/theme';
import { AppScreen } from '../../../ui/AppScreen';
import { Icon } from '../../../ui/Icon';
import { IconButton } from '../../../ui/IconButton';
import { PrimaryButton } from '../../../ui/PrimaryButton';
import {
  addGroupMember,
  deleteGroup,
  generateGroupInvite,
  getChat,
  getGroupInviteState,
  getGroupMembers,
  leaveGroup,
  removeGroupMember,
  revokeGroupInvite,
  transferGroupOwnership,
  updateGroup,
  updateGroupMemberRole,
  uploadGroupAvatar,
  type Chat,
  type GroupMember,
} from '../api/chatApi';
import { ChatAvatar } from '../components/ChatAvatar';
import { pickChatPhoto, type PickedChatAttachment } from '../media/mediaClient';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupDetails'>;

function displayName(member: Pick<GroupMember, 'display_name' | 'username'>): string {
  return member.display_name || member.username;
}

function publicUserName(user: PublicUser): string {
  return user.profile?.display_name || user.profile?.username || '';
}

function isGroupUnavailable(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

export function GroupDetailsScreen({ navigation, route }: Props) {
  const { t } = useI18n();
  const { session } = useSession();
  const { subscribeToChat, subscribeToEvents } = useRealtime();
  const [group, setGroup] = useState<Chat | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [avatar, setAvatar] = useState<PickedChatAttachment | null>(null);
  const [inviteActive, setInviteActive] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [memberQuery, setMemberQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PublicUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [ownershipRecipientId, setOwnershipRecipientId] = useState('');
  const hasLostAccess = useRef(false);

  const role = group?.current_role;
  const isOwner = role === 'owner';
  const canManage = role === 'owner' || role === 'admin';
  const isPending = Boolean(pendingAction);
  const otherMembers = useMemo(
    () => members.filter(member => member.user_id !== session?.user.id),
    [members, session?.user.id],
  );

  const leaveUnavailableGroup = useCallback(() => {
    if (hasLostAccess.current) {
      return;
    }
    hasLostAccess.current = true;
    navigation.popToTop();
  }, [navigation]);

  const loadManagement = useCallback(
    async ({ showLoading = true, syncFields = true }: { showLoading?: boolean; syncFields?: boolean } = {}) => {
      if (showLoading) {
        setIsLoading(true);
        setError('');
      }
      try {
        const nextGroup = await getChat(route.params.chatId);
        if (nextGroup.type !== 'group') {
          leaveUnavailableGroup();
          return;
        }
        const nextMembers = await getGroupMembers(route.params.chatId);
        setGroup(nextGroup);
        setMembers(nextMembers);
        if (syncFields) {
          setTitle(nextGroup.title ?? '');
          setDescription(nextGroup.description ?? '');
          setAvatar(null);
        }
        if (nextGroup.current_role === 'owner' || nextGroup.current_role === 'admin') {
          const inviteState = await getGroupInviteState(route.params.chatId);
          setInviteActive(inviteState.is_active);
        } else {
          setInviteActive(false);
          setInviteLink('');
        }
      } catch (nextError) {
        if (isGroupUnavailable(nextError)) {
          leaveUnavailableGroup();
          return;
        }
        setError(t(authErrorKey(nextError)));
      } finally {
        if (showLoading) {
          setIsLoading(false);
        }
      }
    },
    [leaveUnavailableGroup, route.params.chatId, t],
  );

  useEffect(() => {
    loadManagement().catch(() => undefined);
  }, [loadManagement]);

  useEffect(() => subscribeToChat(route.params.chatId), [route.params.chatId, subscribeToChat]);

  useEffect(() => {
    return subscribeToEvents(event => {
      if (event.chatId !== route.params.chatId) {
        return;
      }
      const isOwnAccessLoss =
        event.event === 'group.deleted' ||
        ((event.event === 'group.member_left' || event.event === 'group.member_removed') &&
          (event.memberUserId === session?.user.id || event.member?.user_id === session?.user.id));
      if (isOwnAccessLoss) {
        leaveUnavailableGroup();
        return;
      }
      if (!event.event.startsWith('group.')) {
        return;
      }
      if (event.chat) {
        setGroup(event.chat);
      }
      if (
        event.event === 'group.updated' ||
        event.event === 'group.member_added' ||
        event.event === 'group.member_joined' ||
        event.event === 'group.member_left' ||
        event.event === 'group.member_removed' ||
        event.event === 'group.member_role_changed' ||
        event.event === 'group.ownership_transferred'
      ) {
        loadManagement({ showLoading: false, syncFields: false }).catch(() => undefined);
      }
    });
  }, [leaveUnavailableGroup, loadManagement, route.params.chatId, session?.user.id, subscribeToEvents]);

  useEffect(() => {
    const query = memberQuery.trim();
    if (!canManage || query.length < 2) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      setIsSearching(true);
      searchPublicUsers(query)
        .then(users => {
          if (active) {
            const memberIds = new Set(members.map(member => member.user_id));
            setSearchResults(users.filter(user => Boolean(user.profile) && !memberIds.has(user.id)));
            setHasSearched(true);
          }
        })
        .catch(nextError => {
          if (active) {
            setError(t(authErrorKey(nextError)));
            setSearchResults([]);
            setHasSearched(true);
          }
        })
        .finally(() => {
          if (active) {
            setIsSearching(false);
          }
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [canManage, memberQuery, members, t]);

  async function runAction(action: string, operation: () => Promise<void>): Promise<void> {
    if (isPending) {
      return;
    }
    setError('');
    setNotice('');
    setPendingAction(action);
    try {
      await operation();
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setPendingAction('');
    }
  }

  async function saveGroup(): Promise<void> {
    await runAction('save', async () => {
      const nextAvatar = avatar
        ? await uploadGroupAvatar({ mimeType: avatar.mimeType, name: avatar.name, uri: avatar.uri })
        : null;
      const nextGroup = await updateGroup(route.params.chatId, {
        title,
        description,
        ...(nextAvatar ? { avatar_ref: nextAvatar.media_url } : {}),
      });
      setGroup(nextGroup);
      setTitle(nextGroup.title ?? '');
      setDescription(nextGroup.description ?? '');
      setAvatar(null);
      setNotice(t('profileUpdated'));
    });
  }

  async function chooseAvatar(): Promise<void> {
    await runAction('avatar', async () => {
      const selected = await pickChatPhoto();
      if (selected) {
        setAvatar(selected);
      }
    });
  }

  async function addMember(user: PublicUser): Promise<void> {
    await runAction(`add:${user.id}`, async () => {
      const nextGroup = await addGroupMember(route.params.chatId, user.id);
      setGroup(nextGroup);
      setMemberQuery('');
      setSearchResults([]);
      await loadManagement({ showLoading: false, syncFields: false });
    });
  }

  async function changeRole(member: GroupMember): Promise<void> {
    const nextRole = member.role === 'admin' ? 'member' : 'admin';
    await runAction(`role:${member.user_id}`, async () => {
      await updateGroupMemberRole(route.params.chatId, member.user_id, nextRole);
      await loadManagement({ showLoading: false, syncFields: false });
    });
  }

  async function removeMember(member: GroupMember): Promise<void> {
    await runAction(`remove:${member.user_id}`, async () => {
      await removeGroupMember(route.params.chatId, member.user_id);
      await loadManagement({ showLoading: false, syncFields: false });
    });
  }

  async function createInvite(): Promise<void> {
    await runAction('invite', async () => {
      const invite = await generateGroupInvite(route.params.chatId);
      setInviteActive(true);
      setInviteLink(invite.invite_link);
    });
  }

  async function revokeInvite(): Promise<void> {
    await runAction('invite', async () => {
      await revokeGroupInvite(route.params.chatId);
      setInviteActive(false);
      setInviteLink('');
    });
  }

  async function copyInvite(): Promise<void> {
    if (!inviteLink) {
      return;
    }
    await runAction('copy-invite', async () => {
      await copyTextToClipboard(inviteLink);
      setNotice(t('groupInviteCopied'));
    });
  }

  async function transferOwnership(andLeave: boolean): Promise<void> {
    if (!ownershipRecipientId) {
      return;
    }
    await runAction(andLeave ? 'transfer-leave' : 'transfer', async () => {
      await transferGroupOwnership(route.params.chatId, ownershipRecipientId);
      if (andLeave) {
        await leaveGroup(route.params.chatId);
        leaveUnavailableGroup();
      } else {
        await loadManagement({ showLoading: false, syncFields: false });
      }
    });
  }

  async function leaveCurrentGroup(): Promise<void> {
    await runAction('leave', async () => {
      await leaveGroup(route.params.chatId);
      leaveUnavailableGroup();
    });
  }

  async function deleteCurrentGroup(): Promise<void> {
    await runAction('delete', async () => {
      await deleteGroup(route.params.chatId);
      leaveUnavailableGroup();
    });
  }

  if (isLoading && !group) {
    return (
      <AppScreen contentStyle={styles.loading}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.muted}>{t('messagesLoading')}</Text>
      </AppScreen>
    );
  }

  return (
    <AppScreen bottomSafeArea contentStyle={styles.content}>
      <View style={styles.header}>
        <IconButton accessibilityLabel={t('back')} icon="back" onPress={() => navigation.goBack()} />
        <Text numberOfLines={1} style={styles.headerTitle}>{t('groupDetails')}</Text>
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}

      {group ? (
        <>
          <View style={[sharedStyles.glassCard, styles.overview]}>
            <ChatAvatar avatarRef={group.avatar_ref} avatarType="uploaded" label={group.title || t('groupChat')} size="regular" />
            <View style={styles.overviewCopy}>
              <Text numberOfLines={2} style={styles.groupName}>{group.title || t('groupChat')}</Text>
              <Text numberOfLines={2} style={styles.groupDescription}>{group.description || t('groupNoDescription')}</Text>
              <Text style={styles.groupMeta}>{t('groupPrivate')} · {t('groupMembers')}: {members.length || group.participant_ids.length}</Text>
            </View>
          </View>

          {isOwner ? (
            <View style={[sharedStyles.glassCard, styles.card]}>
              <Text style={styles.sectionTitle}>{t('groupEdit')}</Text>
              <Text style={styles.fieldLabel}>{t('groupTitleLabel')}</Text>
              <TextInput accessibilityLabel={t('groupTitleLabel')} editable={!isPending} maxLength={120} onChangeText={setTitle} style={styles.input} value={title} />
              <Text style={styles.fieldLabel}>{t('groupDescriptionLabel')}</Text>
              <TextInput accessibilityLabel={t('groupDescriptionLabel')} editable={!isPending} maxLength={500} multiline onChangeText={setDescription} style={[styles.input, styles.descriptionInput]} textAlignVertical="top" value={description} />
              <Pressable accessibilityLabel={t('groupAvatarLabel')} accessibilityRole="button" disabled={isPending} onPress={() => { chooseAvatar().catch(() => undefined); }} style={({ pressed }) => [styles.avatarPicker, pressed && !isPending && styles.pressed]}>
                {avatar ? <Image source={{ uri: avatar.uri }} style={styles.avatarPreview} /> : <View style={styles.avatarPlaceholder}><Icon color={colors.accent} name="photo" size={22} /></View>}
                <View style={styles.avatarCopy}><Text style={styles.avatarTitle}>{t('groupAvatarLabel')}</Text><Text numberOfLines={1} style={styles.avatarDescription}>{avatar ? `${t('groupAvatarSelected')}: ${avatar.name}` : t('groupAvatarChoose')}</Text></View>
                <Icon color={colors.textMuted} name="chevronRight" size={20} />
              </Pressable>
              <PrimaryButton disabled={isPending || title.trim().length < 2} label={pendingAction === 'save' ? t('groupSaving') : t('groupSave')} onPress={() => { saveGroup().catch(() => undefined); }} />
            </View>
          ) : null}

          {canManage ? (
            <View style={[sharedStyles.glassCard, styles.card]}>
              <Text style={styles.sectionTitle}>{t('groupInvite')}</Text>
              <Text style={styles.sectionDescription}>{inviteActive ? t('groupInviteActive') : t('groupInviteInactive')}</Text>
              {inviteLink ? <Text selectable style={styles.inviteLink}>{inviteLink}</Text> : null}
              <View style={styles.buttonRow}>
                <Pressable accessibilityRole="button" disabled={isPending} onPress={() => { createInvite().catch(() => undefined); }} style={({ pressed }) => [styles.secondaryButton, pressed && !isPending && styles.pressed]}><Text style={styles.secondaryButtonLabel}>{inviteActive ? t('groupRegenerateInvite') : t('groupGenerateInvite')}</Text></Pressable>
                {inviteActive ? <Pressable accessibilityRole="button" disabled={isPending} onPress={() => { revokeInvite().catch(() => undefined); }} style={({ pressed }) => [styles.secondaryButton, styles.dangerButton, pressed && !isPending && styles.pressed]}><Text style={styles.dangerButtonLabel}>{t('groupRevokeInvite')}</Text></Pressable> : null}
              </View>
              {inviteLink ? <PrimaryButton disabled={isPending} label={t('groupCopyInvite')} onPress={() => { copyInvite().catch(() => undefined); }} /> : null}
            </View>
          ) : null}

          {canManage ? (
            <View style={[sharedStyles.glassCard, styles.card]}>
              <Text style={styles.sectionTitle}>{t('groupAddMembers')}</Text>
              <View style={styles.searchBox}><Icon color={colors.textFaint} name="search" size={20} /><TextInput accessibilityLabel={t('groupSearchMembers')} editable={!isPending} onChangeText={setMemberQuery} placeholder={t('groupSearchPlaceholder')} placeholderTextColor={colors.textFaint} style={styles.searchInput} value={memberQuery} />{isSearching ? <ActivityIndicator color={colors.accent} size="small" /> : null}</View>
              <Text style={styles.searchHint}>{isSearching ? t('groupSearching') : t('groupSearchHint')}</Text>
              {hasSearched && !isSearching && searchResults.length === 0 ? <Text style={styles.emptySearch}>{t('groupSearchNoResults')}</Text> : null}
              {searchResults.map(user => <Pressable accessibilityLabel={`${t('groupAddMember')}: ${publicUserName(user)}`} accessibilityRole="button" disabled={isPending} key={user.id} onPress={() => { addMember(user).catch(() => undefined); }} style={({ pressed }) => [styles.searchResult, pressed && !isPending && styles.pressed]}><View style={styles.memberInitial}><Text style={styles.memberInitialText}>{publicUserName(user).slice(0, 1).toUpperCase()}</Text></View><View style={styles.memberCopy}><Text numberOfLines={1} style={styles.memberName}>{publicUserName(user)}</Text>{user.profile?.username ? <Text style={styles.memberUsername}>@{user.profile.username}</Text> : null}</View><Text style={styles.addLabel}>{t('groupAddMember')}</Text></Pressable>)}
            </View>
          ) : null}

          <View style={[sharedStyles.glassCard, styles.card]}>
            <Text style={styles.sectionTitle}>{t('groupMembersTitle')}</Text>
            {members.map(member => {
              const isCurrentUser = member.user_id === session?.user.id;
              const canChangeRole = isOwner && !isCurrentUser && member.role !== 'owner';
              const canRemove = !isCurrentUser && member.role !== 'owner' && (isOwner || (role === 'admin' && member.role === 'member'));
              return <View key={member.user_id} style={styles.memberRow}><ChatAvatar avatarRef={member.avatar_ref} avatarType={member.avatar_type} label={displayName(member)} size="small" /><View style={styles.memberCopy}><Text numberOfLines={1} style={styles.memberName}>{displayName(member)}</Text><Text style={styles.memberUsername}>{member.username ? `@${member.username} · ` : ''}{member.role === 'owner' ? t('groupRoleOwner') : member.role === 'admin' ? t('groupRoleAdmin') : t('groupRoleMember')}</Text></View>{canChangeRole ? <Pressable accessibilityLabel={`${member.role === 'admin' ? t('groupMakeMember') : t('groupMakeAdmin')}: ${displayName(member)}`} accessibilityRole="button" disabled={isPending} onPress={() => { changeRole(member).catch(() => undefined); }} style={({ pressed }) => [styles.roleButton, pressed && !isPending && styles.pressed]}><Text style={styles.roleButtonLabel}>{member.role === 'admin' ? t('groupMakeMember') : t('groupMakeAdmin')}</Text></Pressable> : null}{canRemove ? <IconButton accessibilityLabel={`${t('groupRemoveMember')}: ${displayName(member)}`} disabled={isPending} icon="close" onPress={() => Alert.alert(t('groupRemoveMember'), displayName(member), [{ text: t('cancel'), style: 'cancel' }, { text: t('groupRemoveMember'), style: 'destructive', onPress: () => { removeMember(member).catch(() => undefined); } }])} size={48} /> : null}</View>;
            })}
          </View>

          {isOwner ? (
            <View style={[sharedStyles.glassCard, styles.card]}>
              <Text style={styles.sectionTitle}>{t('groupTransferOwnership')}</Text>
              <Text style={styles.sectionDescription}>{t('groupTransferOwnershipHint')}</Text>
              {otherMembers.map(member => <Pressable accessibilityRole="radio" accessibilityState={{ selected: ownershipRecipientId === member.user_id }} disabled={isPending} key={member.user_id} onPress={() => setOwnershipRecipientId(member.user_id)} style={({ pressed }) => [styles.ownerCandidate, ownershipRecipientId === member.user_id && styles.ownerCandidateSelected, pressed && !isPending && styles.pressed]}><Text style={styles.ownerCandidateName}>{displayName(member)}</Text><Text style={styles.ownerCandidateRole}>{member.role === 'admin' ? t('groupRoleAdmin') : t('groupRoleMember')}</Text></Pressable>)}
              <Pressable accessibilityRole="button" disabled={isPending || !ownershipRecipientId} onPress={() => Alert.alert(t('groupTransferOwnership'), t('groupTransferOwnershipHint'), [{ text: t('cancel'), style: 'cancel' }, { text: t('groupTransferOwnership'), onPress: () => { transferOwnership(false).catch(() => undefined); } }])} style={({ pressed }) => [styles.secondaryButton, (!ownershipRecipientId || isPending) && styles.disabledButton, pressed && ownershipRecipientId && !isPending && styles.pressed]}><Text style={styles.secondaryButtonLabel}>{t('groupTransferOwnership')}</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={isPending || !ownershipRecipientId} onPress={() => Alert.alert(t('groupTransferAndLeave'), t('groupLeaveConfirm'), [{ text: t('cancel'), style: 'cancel' }, { text: t('groupTransferAndLeave'), style: 'destructive', onPress: () => { transferOwnership(true).catch(() => undefined); } }])} style={({ pressed }) => [styles.dangerAction, (!ownershipRecipientId || isPending) && styles.disabledButton, pressed && ownershipRecipientId && !isPending && styles.pressed]}><Text style={styles.dangerActionLabel}>{t('groupTransferAndLeave')}</Text></Pressable>
            </View>
          ) : (
            <View style={[sharedStyles.glassCard, styles.card]}>
              <Text style={styles.sectionTitle}>{t('groupLeave')}</Text>
              <Text style={styles.sectionDescription}>{t('groupLeaveConfirm')}</Text>
              <Pressable accessibilityRole="button" disabled={isPending} onPress={() => Alert.alert(t('groupLeave'), t('groupLeaveConfirm'), [{ text: t('cancel'), style: 'cancel' }, { text: t('groupLeave'), style: 'destructive', onPress: () => { leaveCurrentGroup().catch(() => undefined); } }])} style={({ pressed }) => [styles.dangerAction, pressed && !isPending && styles.pressed]}><Text style={styles.dangerActionLabel}>{t('groupLeave')}</Text></Pressable>
            </View>
          )}

          {isOwner ? <View style={[sharedStyles.glassCard, styles.card, styles.deleteCard]}><Text style={styles.sectionTitle}>{t('groupDelete')}</Text><Text style={styles.sectionDescription}>{t('groupDeleteConfirm')}</Text><Pressable accessibilityRole="button" disabled={isPending} onPress={() => Alert.alert(t('groupDelete'), t('groupDeleteConfirm'), [{ text: t('cancel'), style: 'cancel' }, { text: t('groupDelete'), style: 'destructive', onPress: () => { deleteCurrentGroup().catch(() => undefined); } }])} style={({ pressed }) => [styles.dangerAction, pressed && !isPending && styles.pressed]}><Text style={styles.dangerActionLabel}>{t('groupDelete')}</Text></Pressable></View> : null}
        </>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  loading: { alignItems: 'center', flex: 1, gap: spacing.sm, justifyContent: 'center' },
  muted: { color: colors.textMuted, fontSize: 15 },
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  headerTitle: { color: colors.text, flex: 1, fontSize: 20, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  notice: { color: colors.success, fontSize: 14, lineHeight: 20 },
  overview: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  overviewCopy: { flex: 1, minWidth: 0 },
  groupName: { color: colors.text, fontSize: 18, fontWeight: '700' },
  groupDescription: { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginTop: 3 },
  groupMeta: { color: colors.textFaint, fontSize: 12, marginTop: 6 },
  card: { gap: spacing.sm, padding: spacing.md },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  sectionDescription: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  fieldLabel: { color: colors.text, fontSize: 14, fontWeight: '700' },
  input: { backgroundColor: colors.input, borderColor: colors.borderSubtle, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, color: colors.text, fontSize: 16, minHeight: 52, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  descriptionInput: { minHeight: 104 },
  avatarPicker: { alignItems: 'center', borderColor: colors.borderSubtle, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, minHeight: 72, padding: spacing.xs },
  avatarPlaceholder: { alignItems: 'center', backgroundColor: colors.accentSubtle, borderRadius: 24, height: 48, justifyContent: 'center', width: 48 },
  avatarPreview: { borderRadius: 24, height: 48, width: 48 },
  avatarCopy: { flex: 1, minWidth: 0 },
  avatarTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  avatarDescription: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  inviteLink: { backgroundColor: colors.input, borderRadius: 12, color: colors.textMuted, fontSize: 12, lineHeight: 18, padding: spacing.sm },
  buttonRow: { flexDirection: 'row', gap: spacing.sm },
  secondaryButton: { alignItems: 'center', borderColor: colors.borderInteractive, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, flex: 1, justifyContent: 'center', minHeight: 48, paddingHorizontal: spacing.sm },
  secondaryButtonLabel: { color: colors.text, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  dangerButton: { borderColor: colors.danger },
  dangerButtonLabel: { color: colors.danger, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  searchBox: { alignItems: 'center', backgroundColor: colors.input, borderColor: colors.borderSubtle, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.xs, minHeight: 52, paddingHorizontal: spacing.sm },
  searchInput: { color: colors.text, flex: 1, fontSize: 16, minWidth: 0 },
  searchHint: { color: colors.textFaint, fontSize: 12, lineHeight: 18 },
  emptySearch: { color: colors.textMuted, fontSize: 14 },
  searchResult: { alignItems: 'center', borderColor: colors.borderSubtle, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, minHeight: 64, padding: spacing.xs },
  memberInitial: { alignItems: 'center', backgroundColor: colors.surfaceRaised, borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  memberInitialText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  memberRow: { alignItems: 'center', borderTopColor: colors.borderSubtle, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, minHeight: 64, paddingVertical: spacing.xs },
  memberCopy: { flex: 1, minWidth: 0 },
  memberName: { color: colors.text, fontSize: 14, fontWeight: '700' },
  memberUsername: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  addLabel: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  roleButton: { borderColor: colors.borderInteractive, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, minHeight: 40, paddingHorizontal: spacing.sm, justifyContent: 'center' },
  roleButtonLabel: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  ownerCandidate: { borderColor: colors.borderSubtle, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, minHeight: 56, padding: spacing.sm },
  ownerCandidateSelected: { backgroundColor: colors.accentSubtle, borderColor: colors.accent },
  ownerCandidateName: { color: colors.text, fontSize: 14, fontWeight: '700' },
  ownerCandidateRole: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  dangerAction: { alignItems: 'center', borderColor: colors.danger, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', minHeight: 52, paddingHorizontal: spacing.md },
  dangerActionLabel: { color: colors.danger, fontSize: 15, fontWeight: '700' },
  deleteCard: { borderColor: colors.danger },
  disabledButton: { opacity: 0.45 },
  pressed: { backgroundColor: colors.surfacePressed },
});
