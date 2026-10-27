import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { searchPublicUsers, type PublicUser } from '../../search/api/searchApi';
import { useI18n } from '../../../localization/I18nProvider';
import { spacing, type AppColors } from '../../../theme/theme';
import { useTheme, useThemedStyles } from '../../../theme/ThemeProvider';
import { AppScreen } from '../../../ui/AppScreen';
import { Icon } from '../../../ui/Icon';
import { IconButton } from '../../../ui/IconButton';
import { PrimaryButton } from '../../../ui/PrimaryButton';
import { createGroup, uploadGroupAvatar } from '../api/chatApi';
import { pickChatPhoto, type PickedChatAttachment } from '../media/mediaClient';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupCreate'>;

function userName(user: PublicUser): string {
  return user.profile?.display_name || user.profile?.username || '';
}

export function GroupCreateScreen({ navigation }: Props) {
  const { session } = useSession();
  const { t } = useI18n();
  const { colors, sharedStyles } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [avatar, setAvatar] = useState<PickedChatAttachment | null>(null);
  const [memberQuery, setMemberQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PublicUser[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<PublicUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isPickingAvatar, setIsPickingAvatar] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const selectedIds = useMemo(
    () => new Set(selectedMembers.map(member => member.id)),
    [selectedMembers],
  );

  useEffect(() => {
    const query = memberQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setHasSearched(false);
      setIsSearching(false);
      return;
    }

    let active = true;
    const timer = setTimeout(() => {
      setIsSearching(true);
      searchPublicUsers(query)
        .then(users => {
          if (active) {
            setSearchResults(users.filter(user => user.id !== session?.user.id && Boolean(user.profile)));
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
  }, [memberQuery, session?.user.id, t]);

  const pickAvatar = useCallback(async (): Promise<void> => {
    if (isPickingAvatar || isCreating) {
      return;
    }

    setError('');
    setIsPickingAvatar(true);
    try {
      setAvatar(await pickChatPhoto());
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setIsPickingAvatar(false);
    }
  }, [isCreating, isPickingAvatar, t]);

  function addMember(user: PublicUser): void {
    if (!user.profile || selectedIds.has(user.id)) {
      return;
    }
    setSelectedMembers(current => [...current, user]);
  }

  async function submit(): Promise<void> {
    const normalizedTitle = title.trim();
    if (isCreating || normalizedTitle.length < 2) {
      return;
    }

    setError('');
    setIsCreating(true);
    try {
      const avatarUpload = avatar
        ? await uploadGroupAvatar({
            mimeType: avatar.mimeType,
            name: avatar.name,
            uri: avatar.uri,
          })
        : null;
      const group = await createGroup({
        title: normalizedTitle,
        description,
        ...(avatarUpload ? { avatar_ref: avatarUpload.media_url } : {}),
        member_user_ids: selectedMembers.map(member => member.id),
      });
      navigation.replace('GroupChat', {
        chatId: group.id,
        title: group.title?.trim() || normalizedTitle,
      });
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <AppScreen bottomSafeArea contentStyle={styles.content}>
      <View style={styles.header}>
        <IconButton accessibilityLabel={t('back')} icon="back" onPress={() => navigation.goBack()} />
        <View style={styles.headerCopy}>
          <Text style={sharedStyles.eyebrow}>{t('groupCreate')}</Text>
          <Text style={styles.title}>{t('groupCreateTitle')}</Text>
        </View>
      </View>
      <Text style={styles.intro}>{t('groupCreateDescription')}</Text>

      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

      <View style={[sharedStyles.glassCard, styles.card]}>
        <Text style={styles.fieldLabel}>{t('groupTitleLabel')}</Text>
        <TextInput
          accessibilityLabel={t('groupTitleLabel')}
          editable={!isCreating}
          maxLength={120}
          onChangeText={setTitle}
          placeholder={t('groupTitleLabel')}
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          value={title}
        />
        <Text style={styles.fieldLabel}>{t('groupDescriptionLabel')}</Text>
        <TextInput
          accessibilityLabel={t('groupDescriptionLabel')}
          editable={!isCreating}
          maxLength={500}
          multiline
          onChangeText={setDescription}
          placeholder={t('groupDescriptionPlaceholder')}
          placeholderTextColor={colors.textFaint}
          style={[styles.input, styles.descriptionInput]}
          textAlignVertical="top"
          value={description}
        />

        <Pressable
          accessibilityHint={t('attachmentPhotoHint')}
          accessibilityLabel={t('groupAvatarLabel')}
          accessibilityRole="button"
          accessibilityState={{ disabled: isCreating || isPickingAvatar }}
          disabled={isCreating || isPickingAvatar}
          onPress={() => {
            pickAvatar().catch(() => undefined);
          }}
          style={({ pressed }) => [styles.avatarPicker, pressed && styles.pressed]}
        >
          {avatar ? (
            <Image source={{ uri: avatar.uri }} style={styles.avatarPreview} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              {isPickingAvatar ? <ActivityIndicator color={colors.accent} /> : <Icon color={colors.accent} name="photo" size={22} />}
            </View>
          )}
          <View style={styles.avatarCopy}>
            <Text style={styles.avatarTitle}>{t('groupAvatarLabel')}</Text>
            <Text numberOfLines={1} style={styles.avatarDescription}>
              {avatar ? `${t('groupAvatarSelected')}: ${avatar.name}` : t('groupAvatarChoose')}
            </Text>
          </View>
          <Icon color={colors.textMuted} name="chevronRight" size={20} />
        </Pressable>
      </View>

      <View style={[sharedStyles.glassCard, styles.card]}>
        <View style={styles.membersHeading}>
          <View>
            <Text style={styles.sectionTitle}>{t('groupAddMembers')}</Text>
            <Text style={styles.sectionDescription}>
              {t('groupSelectedMembers')}: {selectedMembers.length}
            </Text>
          </View>
          <Icon color={colors.accent} name="groups" size={24} />
        </View>
        {selectedMembers.length ? (
          <View style={styles.chips}>
            {selectedMembers.map(member => (
              <Pressable
                accessibilityLabel={`${t('groupRemoveSelectedMember')}: ${userName(member)}`}
                accessibilityRole="button"
                disabled={isCreating}
                key={member.id}
                onPress={() => setSelectedMembers(current => current.filter(item => item.id !== member.id))}
                style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
              >
                <Text numberOfLines={1} style={styles.chipText}>{userName(member)}</Text>
                <Icon color={colors.onAccent} name="close" size={15} />
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={styles.searchBox}>
          <Icon color={colors.textFaint} name="search" size={20} />
          <TextInput
            accessibilityLabel={t('groupSearchMembers')}
            editable={!isCreating}
            onChangeText={value => {
              setError('');
              setMemberQuery(value);
            }}
            placeholder={t('groupSearchPlaceholder')}
            placeholderTextColor={colors.textFaint}
            style={styles.searchInput}
            value={memberQuery}
          />
          {isSearching ? <ActivityIndicator color={colors.accent} size="small" /> : null}
        </View>
        <Text accessibilityLiveRegion="polite" style={styles.searchHint}>
          {isSearching ? t('groupSearching') : t('groupSearchHint')}
        </Text>
        {hasSearched && !isSearching && searchResults.length === 0 ? (
          <Text style={styles.emptySearch}>{t('groupSearchNoResults')}</Text>
        ) : null}
        {searchResults.map(user => {
          const selected = selectedIds.has(user.id);
          return (
            <Pressable
              accessibilityLabel={`${selected ? t('groupRemoveSelectedMember') : t('groupAddMember')}: ${userName(user)}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              disabled={isCreating || selected}
              key={user.id}
              onPress={() => addMember(user)}
              style={({ pressed }) => [styles.searchResult, selected && styles.searchResultSelected, pressed && !selected && styles.pressed]}
            >
              <View style={styles.userInitial}>
                <Text style={styles.userInitialText}>{userName(user).slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={styles.userCopy}>
                <Text numberOfLines={1} style={styles.userName}>{userName(user)}</Text>
                {user.profile?.username ? <Text style={styles.userUsername}>@{user.profile.username}</Text> : null}
              </View>
              <Text style={styles.addLabel}>{selected ? '✓' : t('groupAddMember')}</Text>
            </Pressable>
          );
        })}
      </View>

      <PrimaryButton
        disabled={isCreating || title.trim().length < 2}
        label={isCreating ? t('groupCreating') : t('groupCreate')}
        onPress={() => {
          submit().catch(() => undefined);
        }}
      />
    </AppScreen>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  headerCopy: { flex: 1, gap: 2 },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  intro: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  card: { gap: spacing.sm, padding: spacing.md },
  fieldLabel: { color: colors.text, fontSize: 14, fontWeight: '700' },
  input: { backgroundColor: colors.input, borderColor: colors.borderSubtle, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, color: colors.text, fontSize: 16, minHeight: 52, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  descriptionInput: { minHeight: 104 },
  avatarPicker: { alignItems: 'center', borderColor: colors.borderSubtle, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, minHeight: 72, padding: spacing.xs },
  avatarPlaceholder: { alignItems: 'center', backgroundColor: colors.accentSubtle, borderRadius: 24, height: 48, justifyContent: 'center', width: 48 },
  avatarPreview: { borderRadius: 24, height: 48, width: 48 },
  avatarCopy: { flex: 1, minWidth: 0 },
  avatarTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  avatarDescription: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  membersHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  sectionDescription: { color: colors.textMuted, fontSize: 13, marginTop: 3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { alignItems: 'center', backgroundColor: colors.accent, borderRadius: 16, flexDirection: 'row', gap: 4, maxWidth: '100%', minHeight: 36, paddingHorizontal: spacing.sm },
  chipPressed: { backgroundColor: colors.accentPressed },
  chipText: { color: colors.onAccent, fontSize: 13, fontWeight: '700', maxWidth: 180 },
  searchBox: { alignItems: 'center', backgroundColor: colors.input, borderColor: colors.borderSubtle, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.xs, minHeight: 52, paddingHorizontal: spacing.sm },
  searchInput: { color: colors.text, flex: 1, fontSize: 16, minWidth: 0 },
  searchHint: { color: colors.textFaint, fontSize: 12, lineHeight: 18 },
  emptySearch: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  searchResult: { alignItems: 'center', borderColor: colors.borderSubtle, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, minHeight: 64, padding: spacing.xs },
  searchResultSelected: { backgroundColor: colors.accentSubtle, borderColor: colors.accent },
  pressed: { backgroundColor: colors.surfacePressed },
  userInitial: { alignItems: 'center', backgroundColor: colors.surfaceRaised, borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  userInitialText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  userCopy: { flex: 1, minWidth: 0 },
  userName: { color: colors.text, fontSize: 14, fontWeight: '700' },
  userUsername: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  addLabel: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  });
}
