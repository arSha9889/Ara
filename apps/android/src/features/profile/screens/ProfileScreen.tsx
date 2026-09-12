import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { RootStackParamList } from '../../../navigation/AppNavigator';
import { useSession } from '../../auth/session/useSession';
import { useI18n } from '../../../localization/I18nProvider';
import { colors, sharedStyles, spacing } from '../../../theme/theme';
import { AppScreen } from '../../../ui/AppScreen';
import { avatarEmoji } from '../avatar';

function firstLetter(value: string): string {
  return value.trim().charAt(0).toUpperCase() || 'A';
}

export function ProfileScreen() {
  const { session } = useSession();
  const { t } = useI18n();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const user = session?.user;
  const name = user?.displayName || user?.username || t('profileFallback');
  const avatar = avatarEmoji(user?.avatarRef);

  return (
    <AppScreen>
      <Text style={sharedStyles.eyebrow}>{t('account')}</Text>
      <Text style={sharedStyles.title}>{t('profile')}</Text>

      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate('ProfileEdit')}
        style={({ pressed }) => [sharedStyles.elevatedCard, styles.profileCard, pressed && styles.pressed]}
      >
        <View accessibilityLabel={`${t('profile')} ${name}`} style={styles.avatar}>
          <Text style={avatar ? styles.avatarEmoji : styles.avatarLetter}>{avatar ?? firstLetter(name)}</Text>
        </View>
        <Text style={styles.name}>{name}</Text>
        {user?.username ? <Text style={styles.username}>@{user.username}</Text> : null}
        {user?.email ? <Text style={styles.email}>{user.email}</Text> : null}
        <Text style={styles.editLabel}>{t('editProfile')}</Text>
      </Pressable>

      <View style={[sharedStyles.glassCard, styles.identifierCard]}>
        <Text style={styles.identifierLabel}>{t('arachatId')}</Text>
        <Text selectable style={styles.identifier}>
          {formatNexusId(user?.nexusId)}
        </Text>
        <Text style={styles.identifierHint}>{t('arachatIdHint')}</Text>
      </View>
    </AppScreen>
  );
}

function formatNexusId(value?: string): string {
  return value ? value.replace(/(.{4})/g, '$1 ').trim() : '—';
}

const styles = StyleSheet.create({
  profileCard: {
    alignItems: 'center',
    marginTop: spacing.lg,
    padding: spacing.lg,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: 'rgba(140, 201, 255, 0.14)',
    borderColor: 'rgba(140, 201, 255, 0.36)',
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
  avatarEmoji: {
    fontSize: 40,
  },
  name: {
    color: colors.text,
    fontSize: 23,
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
  editLabel: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
    marginTop: spacing.sm,
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
  pressed: {
    opacity: 0.78,
  },
});
