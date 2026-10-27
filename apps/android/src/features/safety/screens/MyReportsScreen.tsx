import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { RootStackParamList } from '../../../navigation/AppNavigator';
import { authErrorKey } from '../../auth/authError';
import { useI18n } from '../../../localization/I18nProvider';
import type { TranslationKey } from '../../../localization/messages';
import { spacing, type AppColors } from '../../../theme/theme';
import { useTheme, useThemedStyles } from '../../../theme/ThemeProvider';
import { AppScreen } from '../../../ui/AppScreen';
import { EmptyState } from '../../../ui/EmptyState';
import { IconButton } from '../../../ui/IconButton';
import { getMyReports, type ContentReport, type ReportStatus } from '../api/safetyApi';

const statusKeys: Record<ReportStatus, TranslationKey> = {
  open: 'reportStatusOpen',
  under_review: 'reportStatusUnderReview',
  resolved: 'reportStatusResolved',
  dismissed: 'reportStatusDismissed',
};

const reasonKeys: Record<ContentReport['reason'], TranslationKey> = {
  spam: 'reportReasonSpam',
  abuse: 'reportReasonAbuse',
  harassment: 'reportReasonHarassment',
  violence: 'reportReasonViolence',
  sexual_content: 'reportReasonSexualContent',
  fraud: 'reportReasonFraud',
  other: 'reportReasonOther',
};

export function MyReportsScreen() {
  const { language, t } = useI18n();
  const { colors, sharedStyles } = useTheme();
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [reports, setReports] = useState<ContentReport[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const loadReports = useCallback(async () => {
    setError('');
    setIsLoading(true);
    try {
      setReports(await getMyReports());
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => {
    loadReports().catch(() => undefined);
  }, [loadReports]));

  return (
    <AppScreen>
      <View style={styles.header}>
        <IconButton accessibilityLabel={t('back')} icon="back" onPress={() => navigation.goBack()} />
        <Text style={styles.title}>{t('myReports')}</Text>
      </View>
      <Text style={styles.intro}>{t('myReportsDescription')}</Text>
      {error ? (
        <View accessibilityRole="alert" style={[sharedStyles.glassCard, styles.errorCard]}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => loadReports().catch(() => undefined)} style={styles.retryButton}>
            <Text style={styles.retryLabel}>{t('chatsRetry')}</Text>
          </Pressable>
        </View>
      ) : null}
      {isLoading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
      ) : reports.length === 0 && !error ? (
        <EmptyState description={t('reportsEmptyDescription')} title={t('reportsEmptyTitle')} />
      ) : (
        <View style={styles.list}>
          {reports.map(report => (
            <View key={report.id} style={[sharedStyles.elevatedCard, styles.reportCard]}>
              <View style={styles.reportHeading}>
                <Text style={styles.reason}>{t(reasonKeys[report.reason])}</Text>
                <Text style={styles.status}>{t(statusKeys[report.status])}</Text>
              </View>
              {report.description ? <Text style={styles.description}>{report.description}</Text> : null}
              <Text style={styles.date}>{formatDate(report.updated_at, language)}</Text>
            </View>
          ))}
        </View>
      )}
    </AppScreen>
  );
}

function formatDate(value: string, language: 'ru' | 'en'): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  title: { color: colors.text, flex: 1, fontSize: 24, fontWeight: '700' },
  intro: { color: colors.textMuted, fontSize: 15, lineHeight: 22, marginTop: spacing.xs },
  loading: { alignItems: 'center', justifyContent: 'center', marginTop: spacing.xl },
  errorCard: { gap: spacing.sm, marginTop: spacing.md, padding: spacing.md },
  errorText: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  retryButton: { alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center' },
  retryLabel: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  list: { gap: spacing.sm, marginTop: spacing.lg },
  reportCard: { padding: spacing.md },
  reportHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  reason: { color: colors.text, fontSize: 16, fontWeight: '700' },
  status: { color: colors.primary, fontSize: 13, fontWeight: '700', textAlign: 'right' },
  description: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginTop: spacing.sm },
  date: { color: colors.textFaint, fontSize: 12, marginTop: spacing.sm },
  });
}
