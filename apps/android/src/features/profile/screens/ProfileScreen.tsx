import { StyleSheet, Text, View } from 'react-native';

import { useSession } from '../../auth/session/useSession';
import { useI18n } from '../../../localization/I18nProvider';
import { colors, sharedStyles, spacing } from '../../../theme/theme';
import { AppScreen } from '../../../ui/AppScreen';

function firstLetter(value: string): string {
  return value.trim().charAt(0).toUpperCase() || 'A';
}

export function ProfileScreen() {
  const { session } = useSession();
  const { t } = useI18n();
  const user = session?.user;
  const name = user?.displayName || user?.username || t('profileFallback');

  return (
    <AppScreen>
      <Text style={sharedStyles.eyebrow}>{t('account')}</Text>
      <Text style={sharedStyles.title}>{t('profile')}</Text>

      <View style={[sharedStyles.glassCard, styles.profileCard]}>
        <View accessibilityLabel={`${t('profile')} ${name}`} style={styles.avatar}>
          <Text style={styles.avatarLetter}>{firstLetter(name)}</Text>
        </View>
        <Text style={styles.name}>{name}</Text>
        {user?.username ? <Text style={styles.username}>@{user.username}</Text> : null}
        {user?.email ? <Text style={styles.email}>{user.email}</Text> : null}
      </View>

      <View style={[sharedStyles.glassCard, styles.identifierCard]}>
        <Text style={styles.identifierLabel}>{t('arachatId')}</Text>
        <Text selectable style={styles.identifier}>
          {user?.nexusId ?? '—'}
        </Text>
        <Text style={styles.identifierHint}>{t('arachatIdHint')}</Text>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    alignItems: 'center',
    marginTop: spacing.lg,
    padding: spacing.xl,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: 'rgba(169, 156, 255, 0.24)',
    borderColor: 'rgba(169, 156, 255, 0.58)',
    borderRadius: 44,
    borderWidth: 1,
    height: 88,
    justifyContent: 'center',
    width: 88,
  },
  avatarLetter: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '700',
  },
  name: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    marginTop: spacing.md,
  },
  username: {
    color: colors.primary,
    fontSize: 16,
    marginTop: 4,
  },
  email: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: spacing.xs,
  },
  identifierCard: {
    marginTop: spacing.md,
    padding: spacing.lg,
  },
  identifierLabel: {
    color: colors.textFaint,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  identifier: {
    color: colors.text,
    fontSize: 22,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    letterSpacing: 1.1,
    marginTop: spacing.xs,
  },
  identifierHint: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.sm,
  },
});
