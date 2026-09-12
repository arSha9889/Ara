import { useEffect, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { RootStackParamList } from '../../../navigation/AppNavigator';
import type { SessionUser } from '../../../infrastructure/storage/sessionStore';
import { useI18n } from '../../../localization/I18nProvider';
import { colors, sharedStyles, spacing } from '../../../theme/theme';
import { Icon } from '../../../ui/Icon';
import { authErrorKey } from '../../auth/authError';
import { useSession } from '../../auth/session/useSession';
import { getMyProfile } from '../api/accountApi';
import { AccountScreenLayout, accountStyles } from '../components/AccountScreenLayout';

type Props = NativeStackScreenProps<RootStackParamList, 'AccountCredentials'>;

export function AccountCredentialsScreen({ navigation }: Props) {
  const { session } = useSession();
  const { t } = useI18n();
  const [user, setUser] = useState<SessionUser | null>(session?.user ?? null);
  const [error, setError] = useState('');

  useEffect(() => {
    getMyProfile()
      .then(setUser)
      .catch(nextError => setError(t(authErrorKey(nextError))));
  }, [t]);

  return (
    <AccountScreenLayout description={t('emailAndPasswordDescription')} title={t('accountCredentials')}>
      <View style={[sharedStyles.elevatedCard, accountStyles.card]}>
        <Text style={accountStyles.sectionTitle}>{t('currentEmail')}</Text>
        <Text selectable style={styles.email}>{user?.email ?? '—'}</Text>
        <Text style={user?.emailVerified ? styles.verified : styles.unverified}>
          {user?.emailVerified ? t('emailVerified') : t('emailNotVerified')}
        </Text>

        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('EmailChange')}
          style={({ pressed }) => [accountStyles.row, pressed && styles.pressed]}
        >
          <View style={accountStyles.rowCopy}>
            <Text style={accountStyles.rowTitle}>{t('changeEmail')}</Text>
            <Text style={accountStyles.rowDescription}>{t('emailChangeDescription')}</Text>
          </View>
          <Icon color={colors.textFaint} name="chevronRight" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('PasswordChange')}
          style={({ pressed }) => [accountStyles.row, pressed && styles.pressed]}
        >
          <View style={accountStyles.rowCopy}>
            <Text style={accountStyles.rowTitle}>{t('changePassword')}</Text>
            <Text style={accountStyles.rowDescription}>{t('passwordChangeDescription')}</Text>
          </View>
          <Icon color={colors.textFaint} name="chevronRight" />
        </Pressable>
        {error ? <Text accessibilityRole="alert" style={accountStyles.error}>{error}</Text> : null}
      </View>
    </AccountScreenLayout>
  );
}

const styles = StyleSheet.create({
  email: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  verified: {
    color: colors.success,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  unverified: {
    color: colors.textFaint,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  pressed: {
    opacity: 0.76,
  },
});
