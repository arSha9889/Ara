import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { authErrorKey } from '../../auth/authError';
import { useI18n } from '../../../localization/I18nProvider';
import type { TranslationKey } from '../../../localization/messages';
import { colors, sharedStyles, spacing } from '../../../theme/theme';
import { IconButton } from '../../../ui/IconButton';
import { PrimaryButton } from '../../../ui/PrimaryButton';
import { submitUserReport, type ReportReason } from '../api/safetyApi';

const REPORT_REASONS: ReportReason[] = [
  'spam',
  'abuse',
  'harassment',
  'violence',
  'sexual_content',
  'fraud',
  'other',
];

const reportReasonKeys: Record<ReportReason, TranslationKey> = {
  spam: 'reportReasonSpam',
  abuse: 'reportReasonAbuse',
  harassment: 'reportReasonHarassment',
  violence: 'reportReasonViolence',
  sexual_content: 'reportReasonSexualContent',
  fraud: 'reportReasonFraud',
  other: 'reportReasonOther',
};

interface ReportUserSheetProps {
  userId: string | null;
  visible: boolean;
  onClose(): void;
  onSubmitted(): void;
}

export function ReportUserSheet({ userId, visible, onClose, onSubmitted }: ReportUserSheetProps) {
  const { t } = useI18n();
  const [reason, setReason] = useState<ReportReason>('spam');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function close(): void {
    if (!isSubmitting) {
      setError('');
      onClose();
    }
  }

  async function submit(): Promise<void> {
    if (!userId || isSubmitting || (reason === 'other' && !description.trim())) {
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      await submitUserReport(userId, reason, description);
      setDescription('');
      setReason('spam');
      onSubmitted();
      onClose();
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={close} transparent visible={visible}>
      <View style={styles.overlay}>
        <Pressable
          accessibilityLabel={t('closeSafetyActions')}
          accessibilityRole="button"
          disabled={isSubmitting}
          onPress={close}
          style={styles.backdrop}
        />
        <View accessibilityViewIsModal style={[sharedStyles.glassPanel, styles.sheet]}>
          <View style={styles.handle} />
          <View style={styles.heading}>
            <Text style={styles.title}>{t('reportTitle')}</Text>
            <IconButton
              accessibilityLabel={t('closeSafetyActions')}
              disabled={isSubmitting}
              icon="close"
              onPress={close}
              size={48}
            />
          </View>
          <Text style={styles.description}>{t('reportDescription')}</Text>
          <Text style={styles.fieldLabel}>{t('reportReason')}</Text>
          <View style={styles.reasons}>
            {REPORT_REASONS.map(option => {
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected: option === reason }}
                  key={option}
                  onPress={() => setReason(option)}
                  style={({ pressed }) => [
                    styles.reason,
                    option === reason && styles.reasonSelected,
                    pressed && styles.reasonPressed,
                  ]}
                >
                  <Text style={styles.reasonLabel}>{t(reportReasonKeys[option])}</Text>
                </Pressable>
              );
            })}
          </View>
          {reason === 'other' ? (
            <>
              <Text style={styles.fieldLabel}>{t('reportDetails')}</Text>
              <TextInput
                accessibilityLabel={t('reportDetails')}
                editable={!isSubmitting}
                maxLength={2000}
                multiline
                onChangeText={setDescription}
                placeholder={t('reportDetailsPlaceholder')}
                placeholderTextColor={colors.textFaint}
                style={styles.descriptionInput}
                textAlignVertical="top"
                value={description}
              />
            </>
          ) : null}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={close}
              style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
            >
              <Text style={styles.cancelLabel}>{t('cancel')}</Text>
            </Pressable>
            <View style={styles.submitButton}>
              <PrimaryButton
                disabled={isSubmitting || (reason === 'other' && !description.trim())}
                label={isSubmitting ? t('sendingReport') : t('sendReport')}
                onPress={() => {
                  submit().catch(() => undefined);
                }}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(0, 0, 0, 0.54)', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  sheet: { backgroundColor: colors.glassStrong, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, padding: spacing.lg, paddingBottom: spacing.xl },
  handle: { alignSelf: 'center', backgroundColor: colors.textFaint, borderRadius: 2, height: 4, marginBottom: spacing.md, opacity: 0.7, width: 40 },
  heading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  title: { color: colors.text, flex: 1, fontSize: 20, fontWeight: '700' },
  description: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginTop: spacing.xs },
  fieldLabel: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: spacing.lg },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  reason: { borderColor: colors.glassBorder, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.sm },
  reasonSelected: { backgroundColor: 'rgba(74, 168, 240, 0.22)', borderColor: colors.primary },
  reasonPressed: { backgroundColor: colors.surfacePressed },
  reasonLabel: { color: colors.text, fontSize: 14, fontWeight: '600' },
  descriptionInput: { backgroundColor: colors.input, borderColor: colors.glassBorder, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, color: colors.text, fontSize: 16, lineHeight: 22, marginTop: spacing.sm, maxHeight: 140, minHeight: 100, padding: spacing.sm },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20, marginTop: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  cancelButton: { alignItems: 'center', borderColor: colors.glassBorder, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, flex: 1, justifyContent: 'center', minHeight: 52 },
  cancelLabel: { color: colors.text, fontSize: 16, fontWeight: '700' },
  submitButton: { flex: 1 },
  pressed: { opacity: 0.74 },
});
