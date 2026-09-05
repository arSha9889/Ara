import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputInstance,
} from 'react-native';

import type { RootStackParamList } from '../../../navigation/AppNavigator';
import { authErrorKey } from '../../auth/authError';
import { createDirectChatForUser } from '../../chats/api/chatApi';
import { useSession } from '../../auth/session/useSession';
import { useI18n } from '../../../localization/I18nProvider';
import { colors, sharedStyles, spacing } from '../../../theme/theme';
import { AppScreen } from '../../../ui/AppScreen';
import { EmptyState } from '../../../ui/EmptyState';
import { PrimaryButton } from '../../../ui/PrimaryButton';
import { ReportUserSheet } from '../../safety/components/ReportUserSheet';
import { blockUser } from '../../safety/api/safetyApi';
import {
  normalizeUserSearchQuery,
  searchPublicUsers,
  type PublicUser,
} from '../api/searchApi';

function publicUserName(user: PublicUser, fallback: string): string {
  return user.profile?.display_name || user.profile?.username || fallback;
}

function firstLetter(value: string): string {
  return value.trim().charAt(0).toUpperCase() || 'A';
}

export function SearchScreen() {
  const { t } = useI18n();
  const { session } = useSession();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const inputRef = useRef<TextInputInstance>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<PublicUser | null>(null);
  const [error, setError] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isOpeningChat, setIsOpeningChat] = useState(false);
  const [isBlocking, setIsBlocking] = useState(false);
  const [isReportVisible, setIsReportVisible] = useState(false);
  const normalizedQuery = normalizeUserSearchQuery(query);
  const hasSearchQuery = normalizedQuery.length >= 2;

  useFocusEffect(
    useCallback(() => {
      const timeout = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timeout);
    }, []),
  );

  useEffect(() => {
    let active = true;

    if (!hasSearchQuery) {
      setResults([]);
      setError('');
      setIsSearching(false);
      return () => {
        active = false;
      };
    }

    setIsSearching(true);
    setError('');
    const timeout = setTimeout(() => {
      searchPublicUsers(normalizedQuery)
        .then(users => {
          if (active) {
            setResults(users.filter(user => user.id !== session?.user.id));
          }
        })
        .catch(nextError => {
          if (active) {
            setResults([]);
            setError(t(authErrorKey(nextError)));
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
      clearTimeout(timeout);
    };
  }, [hasSearchQuery, normalizedQuery, session?.user.id, t]);

  async function openChatForUser(user: PublicUser | null): Promise<void> {
    if (!user || isOpeningChat) {
      return;
    }

    setError('');
    setIsOpeningChat(true);

    try {
      const chat = await createDirectChatForUser(user.id);
      const title = chat.peer?.display_name || chat.peer?.username || publicUserName(user, t('chatsDirectFallback'));
      setSelectedUser(null);
      navigation.navigate('Chat', { chatId: chat.id, title, peerUserId: user.id });
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setIsOpeningChat(false);
    }
  }

  const selectedName = selectedUser ? publicUserName(selectedUser, t('profileFallback')) : '';

  function confirmBlockSelectedUser(): void {
    if (!selectedUser || isBlocking || isOpeningChat) {
      return;
    }

    Alert.alert(t('blockUser'), t('blockUserConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('blockUser'),
        style: 'destructive',
        onPress: () => {
          blockSelectedUser().catch(() => undefined);
        },
      },
    ]);
  }

  async function blockSelectedUser(): Promise<void> {
    if (!selectedUser || isBlocking || isOpeningChat) {
      return;
    }

    setError('');
    setIsBlocking(true);
    try {
      await blockUser(selectedUser.id);
      setResults(current => current.filter(user => user.id !== selectedUser.id));
      setSelectedUser(null);
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setIsBlocking(false);
    }
  }

  return (
    <AppScreen>
      <Text style={sharedStyles.eyebrow}>{t('newConnections')}</Text>
      <Text style={sharedStyles.title}>{t('search')}</Text>
      <Text style={styles.intro}>{t('searchIntro')}</Text>

      <View style={styles.searchBox}>
        <Text style={styles.searchSymbol}>⌕</Text>
        <TextInput
          accessibilityLabel={t('searchInput')}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          autoFocus
          clearButtonMode="while-editing"
          onChangeText={setQuery}
          placeholder={t('searchInput')}
          placeholderTextColor={colors.textFaint}
          ref={inputRef}
          style={styles.input}
          value={query}
        />
        {isSearching ? <ActivityIndicator color={colors.primary} size="small" /> : null}
      </View>

      <Text style={styles.hint}>{t('searchHint')}</Text>

      {error ? (
        <View accessibilityRole="alert" style={[sharedStyles.glassCard, styles.errorCard]}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {!hasSearchQuery ? (
        <View style={styles.emptyState}>
          <EmptyState
            description={t('searchEmptyDescription')}
            title={t('searchEmptyTitle')}
          />
        </View>
      ) : null}

      {hasSearchQuery && !isSearching && !error && results.length === 0 ? (
        <View style={styles.emptyState}>
          <EmptyState
            description={t('searchNoResultsDescription')}
            title={t('searchNoResultsTitle')}
          />
        </View>
      ) : null}

      {results.length > 0 ? (
        <View accessibilityLabel={t('searchResults')} style={styles.results}>
          {results.map(user => {
            const name = publicUserName(user, t('profileFallback'));

            return (
              <Pressable
                accessibilityHint={t('searchOpenProfile')}
                accessibilityLabel={name}
                accessibilityRole="button"
                key={user.id}
                onPress={() => setSelectedUser(user)}
                style={({ pressed }) => [styles.result, pressed && styles.resultPressed]}
              >
                <View accessibilityElementsHidden style={styles.avatar}>
                  <Text style={styles.avatarLetter}>{firstLetter(name)}</Text>
                </View>
                <View style={styles.resultCopy}>
                  <View style={styles.resultTitleRow}>
                    <Text numberOfLines={1} style={styles.resultName}>{name}</Text>
                    {user.is_official ? <Text accessibilityLabel={t('officialAccount')} style={styles.officialMark}>✓</Text> : null}
                  </View>
                  {user.profile?.username ? <Text style={styles.username}>@{user.profile.username}</Text> : null}
                </View>
                <Text accessibilityElementsHidden style={styles.chevron}>›</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <Modal
        animationType="slide"
        onRequestClose={() => setSelectedUser(null)}
        transparent
        visible={Boolean(selectedUser)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            accessibilityLabel={t('close')}
            accessibilityRole="button"
            onPress={() => setSelectedUser(null)}
            style={styles.sheetBackdrop}
          />
          <View accessibilityViewIsModal style={[sharedStyles.glassCard, styles.sheet]}>
            <View style={styles.sheetHandle} />
            <View accessibilityElementsHidden style={styles.sheetAvatar}>
              <Text style={styles.sheetAvatarLetter}>{firstLetter(selectedName)}</Text>
            </View>
            <View style={styles.sheetTitleRow}>
              <Text numberOfLines={1} style={styles.sheetTitle}>{selectedName}</Text>
              {selectedUser?.is_official ? <Text accessibilityLabel={t('officialAccount')} style={styles.officialMark}>✓</Text> : null}
            </View>
            {selectedUser?.profile?.username ? <Text style={styles.sheetUsername}>@{selectedUser.profile.username}</Text> : null}
            <Text style={styles.sheetDescription}>{t('searchProfileDescription')}</Text>
            {error ? <Text accessibilityRole="alert" style={styles.sheetError}>{error}</Text> : null}
            <PrimaryButton
              disabled={isOpeningChat || isBlocking}
              label={isOpeningChat ? t('openingChat') : t('writeMessage')}
              onPress={() => {
                openChatForUser(selectedUser).catch(() => undefined);
              }}
            />
            <View style={styles.safetyActions}>
              <Pressable
                accessibilityRole="button"
                disabled={isOpeningChat || isBlocking}
                onPress={() => setIsReportVisible(true)}
                style={({ pressed }) => [
                  styles.safetyButton,
                  pressed && !isOpeningChat && !isBlocking && styles.safetyButtonPressed,
                ]}
              >
                <Text style={styles.safetyButtonLabel}>{t('reportUser')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={isOpeningChat || isBlocking}
                onPress={confirmBlockSelectedUser}
                style={({ pressed }) => [
                  styles.safetyButton,
                  styles.blockButton,
                  pressed && !isOpeningChat && !isBlocking && styles.safetyButtonPressed,
                ]}
              >
                <Text style={styles.blockButtonLabel}>
                  {isBlocking ? '…' : t('blockUser')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <ReportUserSheet
        onClose={() => setIsReportVisible(false)}
        onSubmitted={() => Alert.alert(t('reportSubmitted'))}
        userId={selectedUser?.id ?? null}
        visible={isReportVisible}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  intro: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 23,
    marginTop: spacing.xs,
  },
  searchBox: {
    alignItems: 'center',
    backgroundColor: colors.input,
    borderColor: colors.glassBorder,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    marginTop: spacing.lg,
    minHeight: 56,
    paddingHorizontal: spacing.md,
  },
  searchSymbol: {
    color: colors.primary,
    fontSize: 24,
    marginRight: spacing.sm,
  },
  input: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    minHeight: 48,
  },
  emptyState: {
    marginTop: spacing.lg,
  },
  hint: {
    color: colors.textFaint,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.sm,
  },
  errorCard: {
    marginTop: spacing.md,
    padding: spacing.md,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  results: {
    marginTop: spacing.md,
  },
  result: {
    alignItems: 'center',
    borderBottomColor: colors.glassBorder,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 72,
    paddingVertical: spacing.sm,
  },
  resultPressed: {
    opacity: 0.72,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.glassStrong,
    borderColor: colors.glassBorder,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  avatarLetter: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  resultCopy: {
    flex: 1,
  },
  resultTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  resultName: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  officialMark: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '800',
  },
  username: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: 2,
  },
  chevron: {
    color: colors.textFaint,
    fontSize: 28,
    lineHeight: 28,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.54)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  sheet: {
    alignItems: 'center',
    backgroundColor: colors.canvasMuted,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  sheetHandle: {
    backgroundColor: colors.textFaint,
    borderRadius: 2,
    height: 4,
    marginBottom: spacing.lg,
    opacity: 0.7,
    width: 40,
  },
  sheetAvatar: {
    alignItems: 'center',
    backgroundColor: 'rgba(169, 156, 255, 0.24)',
    borderColor: 'rgba(169, 156, 255, 0.58)',
    borderRadius: 38,
    borderWidth: 1,
    height: 76,
    justifyContent: 'center',
    width: 76,
  },
  sheetAvatarLetter: {
    color: colors.text,
    fontSize: 29,
    fontWeight: '700',
  },
  sheetTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.md,
    maxWidth: '100%',
  },
  sheetTitle: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 22,
    fontWeight: '700',
  },
  sheetUsername: {
    color: colors.primary,
    fontSize: 16,
    marginTop: 4,
  },
  sheetDescription: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.lg,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  sheetError: {
    alignSelf: 'stretch',
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  safetyActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    width: '100%',
  },
  safetyButton: {
    alignItems: 'center',
    borderColor: colors.glassBorder,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  safetyButtonPressed: {
    opacity: 0.74,
  },
  safetyButtonLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  blockButton: {
    borderColor: 'rgba(255, 158, 175, 0.48)',
  },
  blockButtonLabel: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '700',
  },
});
