import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { RootStackParamList } from '../../../navigation/AppNavigator';
import { authErrorKey } from '../../auth/authError';
import { useI18n } from '../../../localization/I18nProvider';
import type { TranslationKey } from '../../../localization/messages';
import { colors, sharedStyles, spacing } from '../../../theme/theme';
import { AppScreen } from '../../../ui/AppScreen';
import { EmptyState } from '../../../ui/EmptyState';
import { PrimaryButton } from '../../../ui/PrimaryButton';
import {
  createSupportTicket,
  getSupportTickets,
  SUPPORT_CATEGORIES,
  type SupportCategory,
  type SupportTicket,
  type SupportTicketStatus,
} from '../api/supportApi';

const categoryKeys: Record<SupportCategory, TranslationKey> = {
  account: 'supportCategoryAccount',
  security: 'supportCategorySecurity',
  messages: 'supportCategoryMessages',
  notifications: 'supportCategoryNotifications',
  bug: 'supportCategoryBug',
  suggestion: 'supportCategorySuggestion',
  other: 'supportCategoryOther',
};

const statusKeys: Record<SupportTicketStatus, TranslationKey> = {
  new: 'supportStatusNew',
  in_progress: 'supportStatusInProgress',
  waiting_user: 'supportStatusWaitingUser',
  resolved: 'supportStatusResolved',
  closed: 'supportStatusClosed',
};

export function SupportTicketsScreen() {
  const { language, t } = useI18n();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [category, setCategory] = useState<SupportCategory>('account');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isCreateFormVisible, setIsCreateFormVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadTickets = useCallback(async () => {
    setError('');
    setIsLoading(true);

    try {
      setTickets(await getSupportTickets());
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      loadTickets().catch(() => undefined);
    }, [loadTickets]),
  );

  function openCreateForm(): void {
    setError('');
    setIsCreateFormVisible(true);
  }

  function closeCreateForm(): void {
    if (isSubmitting) {
      return;
    }

    setError('');
    setCategory('account');
    setSubject('');
    setMessage('');
    setIsCreateFormVisible(false);
  }

  async function submitTicket(): Promise<void> {
    if (isSubmitting) {
      return;
    }

    if (subject.trim().length < 3) {
      setError(t('supportSubjectValidation'));
      return;
    }

    if (!message.trim()) {
      setError(t('supportMessageValidation'));
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const ticket = await createSupportTicket(category, subject, message);
      setCategory('account');
      setSubject('');
      setMessage('');
      setIsCreateFormVisible(false);
      navigation.navigate('SupportTicket', { ticketId: ticket.id });
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppScreen>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={sharedStyles.eyebrow}>{t('help')}</Text>
          <Text style={sharedStyles.title}>{t('support')}</Text>
          <Text style={styles.intro}>{t('supportDescription')}</Text>
        </View>
        <Pressable
          accessibilityLabel={t('supportNewTicket')}
          accessibilityRole="button"
          disabled={isSubmitting}
          onPress={openCreateForm}
          style={({ pressed }) => [
            styles.newTicketButton,
            pressed && !isSubmitting && styles.pressed,
          ]}
        >
          <Text style={styles.newTicketLabel}>+</Text>
        </Pressable>
      </View>

      {isCreateFormVisible ? (
        <View style={[sharedStyles.glassCard, styles.createForm]}>
          <View style={styles.formHeading}>
            <View style={styles.formHeadingCopy}>
              <Text style={styles.formTitle}>{t('supportCreateTitle')}</Text>
              <Text style={styles.formDescription}>{t('supportCreateDescription')}</Text>
            </View>
            <Pressable
              accessibilityLabel={t('close')}
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={closeCreateForm}
              style={styles.closeButton}
            >
              <Text style={styles.closeLabel}>×</Text>
            </Pressable>
          </View>
          <View style={styles.notice}>
            <Text style={styles.noticeLabel}>{t('supportSecurityNotice')}</Text>
            <Text style={styles.noticeDescription}>{t('supportNoAttachments')}</Text>
          </View>
          <Text style={styles.fieldLabel}>{t('supportCategory')}</Text>
          <View style={styles.categories}>
            {SUPPORT_CATEGORIES.map(option => (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: option === category }}
                disabled={isSubmitting}
                key={option}
                onPress={() => setCategory(option)}
                style={({ pressed }) => [
                  styles.category,
                  option === category && styles.categorySelected,
                  pressed && !isSubmitting && styles.pressed,
                ]}
              >
                <Text style={styles.categoryLabel}>{t(categoryKeys[option])}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.fieldLabel}>{t('supportSubject')}</Text>
          <TextInput
            accessibilityLabel={t('supportSubject')}
            editable={!isSubmitting}
            maxLength={160}
            onChangeText={setSubject}
            placeholder={t('supportSubjectPlaceholder')}
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            value={subject}
          />
          <Text style={styles.fieldLabel}>{t('supportMessage')}</Text>
          <TextInput
            accessibilityLabel={t('supportMessage')}
            editable={!isSubmitting}
            maxLength={4000}
            multiline
            onChangeText={setMessage}
            placeholder={t('supportMessagePlaceholder')}
            placeholderTextColor={colors.textFaint}
            style={[styles.input, styles.messageInput]}
            textAlignVertical="top"
            value={message}
          />
          <View style={styles.formActions}>
            <Pressable
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={closeCreateForm}
              style={({ pressed }) => [styles.cancelButton, pressed && !isSubmitting && styles.pressed]}
            >
              <Text style={styles.cancelLabel}>{t('cancel')}</Text>
            </Pressable>
            <View style={styles.createButton}>
              <PrimaryButton
                disabled={isSubmitting || subject.trim().length < 3 || !message.trim()}
                label={isSubmitting ? t('supportCreating') : t('supportCreate')}
                onPress={() => {
                  submitTicket().catch(() => undefined);
                }}
              />
            </View>
          </View>
        </View>
      ) : null}

      {error ? (
        <View accessibilityRole="alert" style={[sharedStyles.glassCard, styles.errorCard]}>
          <Text style={styles.errorText}>{error}</Text>
          {!isCreateFormVisible ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => loadTickets().catch(() => undefined)}
              style={styles.retryButton}
            >
              <Text style={styles.retryLabel}>{t('supportRetry')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : tickets.length === 0 && !error ? (
        <View style={styles.emptyState}>
          <EmptyState description={t('supportEmptyDescription')} title={t('supportEmptyTitle')} />
          {!isCreateFormVisible ? (
            <PrimaryButton label={t('supportNewTicket')} onPress={openCreateForm} />
          ) : null}
        </View>
      ) : (
        <View style={styles.list}>
          {tickets.map(ticket => (
            <Pressable
              accessibilityRole="button"
              key={ticket.id}
              onPress={() => navigation.navigate('SupportTicket', { ticketId: ticket.id })}
              style={({ pressed }) => [
                sharedStyles.glassCard,
                styles.ticketCard,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.ticketHeading}>
                <Text style={styles.ticketNumber}>#{ticket.number}</Text>
                <Text style={styles.status}>{t(statusKeys[ticket.status])}</Text>
              </View>
              <Text numberOfLines={1} style={styles.ticketSubject}>{ticket.subject}</Text>
              <Text numberOfLines={2} style={styles.preview}>
                {ticket.last_message_preview || t('supportNoMessages')}
              </Text>
              <Text style={styles.ticketMeta}>
                {t(categoryKeys[ticket.category])} · {formatDate(ticket.last_message_at, language)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </AppScreen>
  );
}

function formatDate(value: string, language: 'ru' | 'en'): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

const styles = StyleSheet.create({
  header: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  headerCopy: { flex: 1 },
  intro: { color: colors.textMuted, fontSize: 15, lineHeight: 22, marginTop: spacing.xs },
  newTicketButton: { alignItems: 'center', borderColor: colors.primary, borderRadius: 22, borderWidth: 1, height: 44, justifyContent: 'center', marginTop: 4, width: 44 },
  newTicketLabel: { color: colors.primary, fontSize: 28, fontWeight: '400', lineHeight: 30 },
  createForm: { marginTop: spacing.lg, padding: spacing.md },
  formHeading: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  formHeadingCopy: { flex: 1 },
  formTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  formDescription: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginTop: 2 },
  closeButton: { alignItems: 'center', height: 36, justifyContent: 'center', width: 36 },
  closeLabel: { color: colors.textMuted, fontSize: 27, lineHeight: 30 },
  notice: { backgroundColor: 'rgba(169, 156, 255, 0.12)', borderColor: 'rgba(169, 156, 255, 0.36)', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, marginTop: spacing.md, padding: spacing.sm },
  noticeLabel: { color: colors.text, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  noticeDescription: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 2 },
  fieldLabel: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: spacing.md },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  category: { borderColor: colors.glassBorder, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', minHeight: 38, paddingHorizontal: spacing.sm },
  categorySelected: { backgroundColor: 'rgba(67, 182, 255, 0.24)', borderColor: colors.primary },
  categoryLabel: { color: colors.text, fontSize: 13, fontWeight: '600' },
  input: { backgroundColor: colors.input, borderColor: colors.glassBorder, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, color: colors.text, fontSize: 16, marginTop: spacing.xs, minHeight: 48, paddingHorizontal: spacing.sm },
  messageInput: { lineHeight: 22, maxHeight: 180, minHeight: 120, paddingTop: spacing.sm },
  formActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  cancelButton: { alignItems: 'center', borderColor: colors.glassBorder, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, flex: 1, justifyContent: 'center', minHeight: 52 },
  cancelLabel: { color: colors.text, fontSize: 16, fontWeight: '700' },
  createButton: { flex: 1 },
  errorCard: { gap: spacing.sm, marginTop: spacing.md, padding: spacing.md },
  errorText: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  retryButton: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center' },
  retryLabel: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  loading: { alignItems: 'center', justifyContent: 'center', marginTop: spacing.xl },
  emptyState: { gap: spacing.md, marginTop: spacing.lg },
  list: { gap: spacing.sm, marginTop: spacing.lg },
  ticketCard: { padding: spacing.md },
  ticketHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  ticketNumber: { color: colors.primary, fontSize: 13, fontVariant: ['tabular-nums'], fontWeight: '700' },
  status: { color: colors.success, fontSize: 13, fontWeight: '700', textAlign: 'right' },
  ticketSubject: { color: colors.text, fontSize: 17, fontWeight: '700', marginTop: spacing.xs },
  preview: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginTop: 4 },
  ticketMeta: { color: colors.textFaint, fontSize: 12, marginTop: spacing.sm },
  pressed: { opacity: 0.74 },
});
