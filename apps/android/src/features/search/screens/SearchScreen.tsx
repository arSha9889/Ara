import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputInstance,
} from 'react-native';

import type { RootStackParamList } from '../../../navigation/AppNavigator';
import type { MainTabParamList } from '../../../navigation/MainTabs';
import { authErrorKey } from '../../auth/authError';
import { createDirectChatForUser } from '../../chats/api/chatApi';
import { useSession } from '../../auth/session/useSession';
import { useI18n } from '../../../localization/I18nProvider';
import { spacing, type AppColors } from '../../../theme/theme';
import { useTheme, useThemedStyles } from '../../../theme/ThemeProvider';
import { AppScreen } from '../../../ui/AppScreen';
import { AnimatedBottomSheet } from '../../../ui/AnimatedBottomSheet';
import { EmptyState } from '../../../ui/EmptyState';
import { Icon } from '../../../ui/Icon';
import { InterfaceIcon } from '../../../ui/InterfaceIcon';
import { PrimaryButton } from '../../../ui/PrimaryButton';
import { ReportUserSheet } from '../../safety/components/ReportUserSheet';
import { blockUser } from '../../safety/api/safetyApi';
import { useDirectCall } from '../../calls/DirectCallProvider';
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
  const { colors, sharedStyles } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { session } = useSession();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<MainTabParamList, 'Search'>>();
  const { call, startCall, startVideoCall } = useDirectCall();
  const inputRef = useRef<TextInputInstance>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<PublicUser | null>(null);
  const [error, setError] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isOpeningChat, setIsOpeningChat] = useState(false);
  const [isStartingCall, setIsStartingCall] = useState(false);
  const [isBlocking, setIsBlocking] = useState(false);
  const [isReportVisible, setIsReportVisible] = useState(false);
  const normalizedQuery = normalizeUserSearchQuery(query);
  const hasSearchQuery = normalizedQuery.length >= 2;
  const isCallMode = route.params?.mode === 'call';

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
      navigation.navigate('MainTabs', { params: { mode: undefined }, screen: 'Search' });
      navigation.navigate('Chat', {
        chatId: chat.id,
        title,
        peerUserId: user.id,
        peerIsOnline: chat.peer?.is_online,
        peerLastSeenAt: chat.peer?.last_seen_at,
      });
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setIsOpeningChat(false);
    }
  }

  async function startCallForUser(
    user: PublicUser | null,
    callType: 'audio' | 'video',
  ): Promise<void> {
    if (!user || isOpeningChat || isStartingCall || isBlocking || call) {
      return;
    }

    setError('');
    setIsStartingCall(true);
    try {
      const chat = await createDirectChatForUser(user.id);
      const title = chat.peer?.display_name || chat.peer?.username || publicUserName(user, t('chatsDirectFallback'));
      setSelectedUser(null);
      navigation.navigate('Chat', {
        chatId: chat.id,
        title,
        peerUserId: user.id,
        peerIsOnline: chat.peer?.is_online,
        peerLastSeenAt: chat.peer?.last_seen_at,
      });
      const start = callType === 'video' ? startVideoCall : startCall;
      await start({ chatId: chat.id, peerName: title, peerUserId: user.id });
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setIsStartingCall(false);
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
      <Text style={sharedStyles.eyebrow}>{t(isCallMode ? 'newCallSearchEyebrow' : 'newConnections')}</Text>
      <Text style={sharedStyles.title}>{t(isCallMode ? 'newCallSearchTitle' : 'search')}</Text>
      <Text style={styles.intro}>{t(isCallMode ? 'newCallSearchDescription' : 'searchIntro')}</Text>

      <View style={styles.searchBox}>
        <Icon color={colors.primary} name="search" size={22} />
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
            icon={isCallMode ? 'call' : undefined}
            title={t('searchEmptyTitle')}
          />
        </View>
      ) : null}

      {hasSearchQuery && !isSearching && !error && results.length === 0 ? (
        <View style={styles.emptyState}>
          <EmptyState
            description={t('searchNoResultsDescription')}
            icon={isCallMode ? 'call' : undefined}
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
                <View accessibilityElementsHidden style={styles.chevron}>
                  <Icon color={colors.textFaint} name="chevronRight" size={20} />
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <AnimatedBottomSheet
        accessibilityLabel={t('close')}
        onClose={() => setSelectedUser(null)}
        sheetStyle={styles.sheet}
        visible={Boolean(selectedUser)}
      >
          <View>
            <View style={styles.sheetHandle} />
            <View accessibilityElementsHidden style={styles.sheetAvatar}>
              <Text style={styles.sheetAvatarLetter}>{firstLetter(selectedName)}</Text>
            </View>
            <View style={styles.sheetTitleRow}>
              <Text numberOfLines={1} style={styles.sheetTitle}>{selectedName}</Text>
              {selectedUser?.is_official ? <Text accessibilityLabel={t('officialAccount')} style={styles.officialMark}>✓</Text> : null}
            </View>
            {selectedUser?.profile?.username ? <Text style={styles.sheetUsername}>@{selectedUser.profile.username}</Text> : null}
            <Text style={styles.sheetDescription}>{t(isCallMode ? 'newCallSearchDescription' : 'searchProfileDescription')}</Text>
            {error ? <Text accessibilityRole="alert" style={styles.sheetError}>{error}</Text> : null}
            {isCallMode ? (
              <View style={styles.callActions}>
                <Pressable
                  accessibilityLabel={t('callAudio')}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isStartingCall || isBlocking || Boolean(call) }}
                  disabled={isStartingCall || isBlocking || Boolean(call)}
                  onPress={() => {
                    startCallForUser(selectedUser, 'audio').catch(() => undefined);
                  }}
                  style={({ pressed }) => [
                    styles.callAction,
                    (isStartingCall || isBlocking || call) && styles.callActionDisabled,
                    pressed && !isStartingCall && !isBlocking && !call && styles.callActionPressed,
                  ]}
                >
                  <InterfaceIcon color={colors.onAccent} name="phoneCall" size={20} />
                  <Text style={styles.callActionLabel}>{isStartingCall ? t('startingCall') : t('callAudio')}</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={t('callVideo')}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isStartingCall || isBlocking || Boolean(call) }}
                  disabled={isStartingCall || isBlocking || Boolean(call)}
                  onPress={() => {
                    startCallForUser(selectedUser, 'video').catch(() => undefined);
                  }}
                  style={({ pressed }) => [
                    styles.callAction,
                    styles.videoCallAction,
                    (isStartingCall || isBlocking || call) && styles.callActionDisabled,
                    pressed && !isStartingCall && !isBlocking && !call && styles.callActionPressed,
                  ]}
                >
                  <InterfaceIcon color={colors.primary} name="videoCamera" size={20} />
                  <Text style={styles.videoCallActionLabel}>{isStartingCall ? t('startingCall') : t('callVideo')}</Text>
                </Pressable>
              </View>
            ) : (
              <PrimaryButton
                disabled={isOpeningChat || isBlocking}
                label={isOpeningChat ? t('openingChat') : t('writeMessage')}
                onPress={() => {
                  openChatForUser(selectedUser).catch(() => undefined);
                }}
              />
            )}
            <View style={styles.safetyActions}>
              <Pressable
                accessibilityRole="button"
                disabled={isOpeningChat || isStartingCall || isBlocking}
                onPress={() => setIsReportVisible(true)}
                style={({ pressed }) => [
                  styles.safetyButton,
                  pressed && !isOpeningChat && !isStartingCall && !isBlocking && styles.safetyButtonPressed,
                ]}
              >
                <Text style={styles.safetyButtonLabel}>{t('reportUser')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={isOpeningChat || isStartingCall || isBlocking}
                onPress={confirmBlockSelectedUser}
                style={({ pressed }) => [
                  styles.safetyButton,
                  styles.blockButton,
                  pressed && !isOpeningChat && !isStartingCall && !isBlocking && styles.safetyButtonPressed,
                ]}
              >
                <Text style={styles.blockButtonLabel}>
                  {isBlocking ? '…' : t('blockUser')}
                </Text>
              </Pressable>
            </View>
          </View>
      </AnimatedBottomSheet>
      <ReportUserSheet
        onClose={() => setIsReportVisible(false)}
        onSubmitted={() => Alert.alert(t('reportSubmitted'))}
        userId={selectedUser?.id ?? null}
        visible={isReportVisible}
      />
    </AppScreen>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
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
    borderBottomColor: colors.divider,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 72,
    paddingVertical: spacing.sm,
  },
  resultPressed: {
    backgroundColor: colors.surface,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
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
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 24,
  },
  sheet: {
    alignItems: 'center',
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
    backgroundColor: colors.accentSubtle,
    borderColor: colors.accent,
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
  callActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
  },
  callAction: {
    alignItems: 'center',
    backgroundColor: colors.primaryStrong,
    borderRadius: 14,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.sm,
  },
  videoCallAction: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.primary,
    borderWidth: StyleSheet.hairlineWidth,
  },
  callActionPressed: {
    backgroundColor: colors.primaryPressed,
  },
  callActionDisabled: {
    opacity: 0.45,
  },
  callActionLabel: {
    color: colors.onAccent,
    fontSize: 14,
    fontWeight: '700',
  },
  videoCallActionLabel: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
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
    borderColor: colors.danger,
  },
  blockButtonLabel: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '700',
  },
  });
}
