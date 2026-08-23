import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { RootStackParamList } from '../../../navigation/AppNavigator';
import { authErrorKey } from '../../auth/authError';
import { useSession } from '../../auth/session/useSession';
import { getMessages, markMessagesRead, sendTextMessage, type ChatMessage } from '../api/chatApi';
import { useI18n } from '../../../localization/I18nProvider';
import { colors, sharedStyles, spacing } from '../../../theme/theme';
import { AppScreen } from '../../../ui/AppScreen';
import { EmptyState } from '../../../ui/EmptyState';

export interface ChatRouteParams {
  chatId: string;
  title: string;
}

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

export function ChatScreen({ navigation, route }: Props) {
  const { language, t } = useI18n();
  const { session } = useSession();
  const messageList = useRef<FlatList<ChatMessage>>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const loadMessages = useCallback(async () => {
    setError('');
    setIsLoading(true);

    try {
      const nextMessages = await getMessages(route.params.chatId);
      setMessages(nextMessages);

      const unreadIds = nextMessages
        .filter(message => !message.deleted_at && message.sender_id !== session?.user.id)
        .map(message => message.id);

      if (unreadIds.length > 0) {
        markMessagesRead(route.params.chatId, unreadIds).catch(() => undefined);
      }
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setIsLoading(false);
    }
  }, [route.params.chatId, session?.user.id, t]);

  useEffect(() => {
    loadMessages().catch(() => undefined);
  }, [loadMessages]);

  async function handleSend(): Promise<void> {
    const messageText = text.trim();

    if (!messageText || isSending) {
      return;
    }

    setError('');
    setIsSending(true);
    try {
      const message = await sendTextMessage(route.params.chatId, messageText);
      setMessages(current => [...current, message]);
      setText('');
      requestAnimationFrame(() => messageList.current?.scrollToEnd({ animated: true }));
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setIsSending(false);
    }
  }

  function renderMessage({ item }: { item: ChatMessage }) {
    const isOwn = item.sender_id === session?.user.id;
    const messageText = item.deleted_at ? t('messageDeleted') : item.payload;

    return (
      <View style={[styles.messageRow, isOwn && styles.messageRowOwn]}>
        <View style={[styles.messageBubble, isOwn ? styles.messageBubbleOwn : styles.messageBubblePeer]}>
          <Text style={[styles.messageText, item.deleted_at && styles.deletedMessageText]}>{messageText}</Text>
          <View style={styles.messageMeta}>
            {item.edited_at ? (
              <Text style={[styles.messageMetaText, isOwn && styles.messageMetaTextOwn]}>
                {t('messageEdited')}
              </Text>
            ) : null}
            <Text style={[styles.messageMetaText, isOwn && styles.messageMetaTextOwn]}>
              {formatMessageTime(item.created_at, language)}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', default: undefined })}
      style={styles.keyboardAvoidingView}
    >
      <AppScreen scroll={false} contentStyle={styles.content}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel={t('backToChats')}
            accessibilityRole="button"
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Text style={styles.backLabel}>{t('back')}</Text>
          </Pressable>
          <Text numberOfLines={1} style={styles.title}>
            {route.params.title}
          </Text>
          <Pressable
            accessibilityLabel={t('call')}
            accessibilityRole="button"
            onPress={() => Alert.alert(t('callsSoon'))}
            style={styles.callButton}
          >
            <Text style={styles.callLabel}>{t('call')}</Text>
          </Pressable>
        </View>

        {isLoading && messages.length === 0 ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingLabel}>{t('messagesLoading')}</Text>
          </View>
        ) : (
          <FlatList
            ref={messageList}
            contentContainerStyle={messages.length === 0 ? styles.emptyMessages : styles.messagesList}
            data={messages}
            keyExtractor={message => message.id}
            ListEmptyComponent={
              !error ? (
                <EmptyState
                  description={t('messagesEmptyDescription')}
                  title={t('messagesEmptyTitle')}
                />
              ) : undefined
            }
            onContentSizeChange={() => messageList.current?.scrollToEnd({ animated: false })}
            renderItem={renderMessage}
            showsVerticalScrollIndicator={false}
          />
        )}

        {error ? (
          <View accessibilityRole="alert" style={[sharedStyles.glassCard, styles.errorCard]}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              onPress={() => {
                loadMessages().catch(() => undefined);
              }}
              style={styles.retryButton}
            >
              <Text style={styles.retryLabel}>{t('messagesRetry')}</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={[sharedStyles.glassCard, styles.composer]}>
          <TextInput
            accessibilityLabel={t('messageInputPlaceholder')}
            editable={!isSending}
            multiline
            onChangeText={setText}
            placeholder={t('messageInputPlaceholder')}
            placeholderTextColor={colors.textFaint}
            style={styles.composerInput}
            value={text}
          />
          <Pressable
            accessibilityLabel={isSending ? t('sendingMessage') : t('sendMessage')}
            accessibilityRole="button"
            disabled={!text.trim() || isSending}
            onPress={() => {
              handleSend().catch(() => undefined);
            }}
            style={({ pressed }) => [
              styles.sendButton,
              (!text.trim() || isSending) && styles.sendButtonDisabled,
              pressed && text.trim() && !isSending && styles.sendButtonPressed,
            ]}
          >
            <Text style={styles.sendLabel}>{isSending ? '…' : '↑'}</Text>
          </Pressable>
        </View>
      </AppScreen>
    </KeyboardAvoidingView>
  );
}

function formatMessageTime(value: string, language: 'ru' | 'en'): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    backgroundColor: colors.canvas,
    flex: 1,
  },
  content: {
    paddingBottom: spacing.md,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  backButton: {
    justifyContent: 'center',
    minHeight: 48,
  },
  backLabel: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    color: colors.text,
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  callButton: {
    alignItems: 'center',
    borderColor: colors.glassBorder,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.sm,
  },
  callLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  loadingState: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
  },
  loadingLabel: {
    color: colors.textMuted,
    fontSize: 15,
  },
  messagesList: {
    gap: spacing.xs,
    paddingBottom: spacing.md,
  },
  emptyMessages: {
    flexGrow: 1,
  },
  messageRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  messageRowOwn: {
    justifyContent: 'flex-end',
  },
  messageBubble: {
    borderRadius: 18,
    maxWidth: '82%',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  messageBubbleOwn: {
    backgroundColor: colors.primaryStrong,
    borderBottomRightRadius: 4,
  },
  messageBubblePeer: {
    backgroundColor: colors.canvasMuted,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
  },
  deletedMessageText: {
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  messageMeta: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: 5,
    marginTop: 3,
  },
  messageMetaText: {
    color: colors.textFaint,
    fontSize: 11,
  },
  messageMetaTextOwn: {
    color: 'rgba(9, 18, 31, 0.68)',
  },
  errorCard: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.sm,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  retryButton: {
    alignSelf: 'flex-start',
    minHeight: 36,
    justifyContent: 'center',
  },
  retryLabel: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  composer: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.xs,
  },
  composerInput: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    maxHeight: 120,
    minHeight: 48,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: colors.primaryStrong,
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  sendButtonDisabled: {
    backgroundColor: 'rgba(67, 182, 255, 0.28)',
  },
  sendButtonPressed: {
    opacity: 0.8,
  },
  sendLabel: {
    color: colors.canvas,
    fontSize: 23,
    fontWeight: '700',
    lineHeight: 25,
  },
});
