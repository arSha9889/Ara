import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import type { RootStackParamList } from '../../../navigation/AppNavigator';
import { useI18n } from '../../../localization/I18nProvider';
import { colors, sharedStyles, spacing } from '../../../theme/theme';
import { AppScreen } from '../../../ui/AppScreen';

export interface ChatRouteParams {
  title: string;
}

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

export function ChatScreen({ navigation, route }: Props) {
  const { t } = useI18n();

  return (
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
          onPress={() => Alert.alert('Звонки скоро появятся')}
          style={styles.callButton}
        >
          <Text style={styles.callLabel}>{t('call')}</Text>
        </Pressable>
      </View>

      <View style={[sharedStyles.glassCard, styles.placeholder]}>
        <Text style={styles.placeholderTitle}>{t('messagesPlaceholder')}</Text>
        <Text style={styles.placeholderBody}>
          {t('messagesPlaceholderDescription')}
        </Text>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
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
  placeholder: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  placeholderTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '700',
  },
  placeholderBody: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 23,
    marginTop: spacing.sm,
    maxWidth: 300,
    textAlign: 'center',
  },
});
