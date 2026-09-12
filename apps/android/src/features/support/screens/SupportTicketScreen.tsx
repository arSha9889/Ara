import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
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
import { useI18n } from '../../../localization/I18nProvider';
import type { TranslationKey } from '../../../localization/messages';
import { colors, sharedStyles, spacing } from '../../../theme/theme';
import { AppScreen } from '../../../ui/AppScreen';
import { IconButton } from '../../../ui/IconButton';
import { PrimaryButton } from '../../../ui/PrimaryButton';
import {
  createSupportMessage,
  getSupportTicket,
  type SupportMessage,
  type SupportTicketDetail,
  type SupportTicketStatus,
} from '../api/supportApi';

type Props = NativeStackScreenProps<RootStackParamList, 'SupportTicket'>;

const statusKeys: Record<SupportTicketStatus, TranslationKey> = {
  new: 'supportStatusNew',
  in_progress: 'supportStatusInProgress',
  waiting_user: 'supportStatusWaitingUser',
  resolved: 'supportStatusResolved',
  closed: 'supportStatusClosed',
};

export function SupportTicketScreen({ navigation, route }: Props) {
  const { language, t } = useI18n();
  const { session } = useSession();
  const [ticket, setTicket] = useState<SupportTicketDetail | null>(null);
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const loadTicket = useCallback(async () => {
    setError('');
    setIsLoading(true);

    try {
      setTicket(await getSupportTicket(route.params.ticketId));
    } catch (nextError) {
      setTicket(null);
      setError(t(authErrorKey(nextError)));
    } finally {
      setIsLoading(false);
    }
  }, [route.params.ticketId, t]);

  useFocusEffect(
    useCallback(() => {
      loadTicket().catch(() => undefined);
    }, [loadTicket]),
  );

  const isReplyAvailable = Boolean(ticket && ticket.status !== 'resolved' && ticket.status !== 'closed');

  async function sendReply(): Promise<void> {
    if (!ticket || !reply.trim() || isSending || !isReplyAvailable) {
      return;
    }

    setError('');
    setIsSending(true);

    try {
      setTicket(await createSupportMessage(ticket.id, reply));
      setReply('');
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setIsSending(false);
    }
  }

  function renderMessage({ item }: { item: SupportMessage }) {
    const isMine = item.author_user_id === session?.user.id;

    return (
      <View style={[styles.message, isMine ? styles.messageMine : styles.messageTeam]}>
        <View style={styles.messageMeta}>
          <Text style={styles.messageAuthor}>{isMine ? t('supportYou') : t('supportTeam')}</Text>
          <Text style={styles.messageDate}>{formatMessageDate(item.created_at, language)}</Text>
        </View>
        <Text style={styles.messageText}>{item.text}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', default: undefined })}
      style={styles.keyboardAvoidingView}
    >
      <AppScreen contentStyle={styles.content} scroll={false}>
        <View style={styles.header}>
          <IconButton
            accessibilityLabel={t('back')}
            icon="back"
            onPress={() => navigation.goBack()}
          />
          <Text numberOfLines={1} style={styles.headerTitle}>
            {ticket ? `${t('supportTicket')} #${ticket.number}` : t('support')}
          </Text>
        </View>

        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : ticket ? (
          <>
            <View style={[sharedStyles.elevatedCard, styles.ticketCard]}>
              <View style={styles.ticketHeading}>
                <Text numberOfLines={2} style={styles.subject}>{ticket.subject}</Text>
                <Text style={styles.status}>{t(statusKeys[ticket.status])}</Text>
              </View>
              <Text style={styles.createdAt}>
                {t('supportCreatedAt')} {formatMessageDate(ticket.created_at, language)}
              </Text>
            </View>
            {error ? (
              <View accessibilityRole="alert" style={[sharedStyles.glassCard, styles.errorCard]}>
                <Text style={styles.errorText}>{error}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => loadTicket().catch(() => undefined)}
                  style={styles.retryButton}
                >
                  <Text style={styles.retryLabel}>{t('supportRetry')}</Text>
                </Pressable>
              </View>
            ) : null}
            <FlatList
              contentContainerStyle={styles.messagesList}
              data={ticket.messages}
              keyExtractor={message => message.id}
              renderItem={renderMessage}
              style={styles.messages}
            />
            {isReplyAvailable ? (
              <View style={[sharedStyles.glassPanel, styles.composer]}>
                <TextInput
                  accessibilityLabel={t('supportReply')}
                  editable={!isSending}
                  maxLength={4000}
                  multiline
                  onChangeText={setReply}
                  placeholder={t('supportReplyPlaceholder')}
                  placeholderTextColor={colors.textFaint}
                  style={styles.replyInput}
                  textAlignVertical="top"
                  value={reply}
                />
                <PrimaryButton
                  disabled={isSending || !reply.trim()}
                  label={isSending ? t('supportSending') : t('supportSend')}
                  onPress={() => {
                    sendReply().catch(() => undefined);
                  }}
                />
              </View>
            ) : (
              <View style={[sharedStyles.elevatedCard, styles.resolvedCard]}>
                <Text style={styles.resolvedText}>{t('supportResolvedDescription')}</Text>
                <PrimaryButton
                  label={t('supportOpenNewTicket')}
                  onPress={() => navigation.navigate('SupportTickets')}
                />
              </View>
            )}
          </>
        ) : (
          <View accessibilityRole="alert" style={[sharedStyles.glassCard, styles.errorCard]}>
            <Text style={styles.errorText}>{error || t('supportTicketNotFound')}</Text>
            <PrimaryButton label={t('supportBackToTickets')} onPress={() => navigation.goBack()} />
          </View>
        )}
      </AppScreen>
    </KeyboardAvoidingView>
  );
}

function formatMessageDate(value: string, language: 'ru' | 'en'): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

const styles = StyleSheet.create({
  keyboardAvoidingView: { backgroundColor: colors.canvas, flex: 1 },
  content: { flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  headerTitle: { color: colors.text, flex: 1, fontSize: 21, fontWeight: '700' },
  loading: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  ticketCard: { marginTop: spacing.xs, padding: spacing.md },
  ticketHeading: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  subject: { color: colors.text, flex: 1, fontSize: 17, fontWeight: '700', lineHeight: 23 },
  status: { color: colors.success, fontSize: 13, fontWeight: '700', maxWidth: 120, textAlign: 'right' },
  createdAt: { color: colors.textFaint, fontSize: 12, marginTop: spacing.sm },
  errorCard: { gap: spacing.sm, marginTop: spacing.md, padding: spacing.md },
  errorText: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  retryButton: { alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center' },
  retryLabel: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  messages: { flex: 1, marginTop: spacing.sm },
  messagesList: { gap: spacing.sm, paddingBottom: spacing.sm },
  message: { borderRadius: 18, maxWidth: '88%', padding: spacing.sm },
  messageMine: { alignSelf: 'flex-end', backgroundColor: 'rgba(74, 168, 240, 0.25)', borderColor: 'rgba(140, 201, 255, 0.38)', borderWidth: StyleSheet.hairlineWidth },
  messageTeam: { alignSelf: 'flex-start', backgroundColor: colors.surfaceRaised, borderColor: colors.glassBorder, borderWidth: StyleSheet.hairlineWidth },
  messageMeta: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  messageAuthor: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  messageDate: { color: colors.textFaint, fontSize: 11 },
  messageText: { color: colors.text, fontSize: 15, lineHeight: 21, marginTop: 4 },
  composer: { gap: spacing.sm, marginBottom: spacing.md, padding: spacing.sm },
  replyInput: { backgroundColor: colors.input, borderColor: colors.glassBorder, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, color: colors.text, fontSize: 16, lineHeight: 22, maxHeight: 130, minHeight: 76, padding: spacing.sm },
  resolvedCard: { gap: spacing.md, marginBottom: spacing.md, padding: spacing.md },
  resolvedText: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
});
