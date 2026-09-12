import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useI18n } from '../../../localization/I18nProvider';
import { colors, sharedStyles, spacing } from '../../../theme/theme';
import { PrimaryButton } from '../../../ui/PrimaryButton';
import { authErrorKey } from '../../auth/authError';
import { useSession } from '../../auth/session/useSession';
import { AccountScreenLayout, accountStyles } from '../../account/components/AccountScreenLayout';
import { getMyProfile, updateMyProfile, updateUsername } from '../../account/api/accountApi';
import { avatarEmoji, builtInAvatarRefs, type BuiltInAvatarRef } from '../avatar';

const usernamePattern = /^[A-Za-z0-9]{3,32}$/;

export function ProfileEditScreen() {
  const { session, saveSession } = useSession();
  const { t } = useI18n();
  const [displayName, setDisplayName] = useState(session?.user.displayName ?? '');
  const [username, setUsername] = useState(session?.user.username ?? '');
  const [phone, setPhone] = useState(session?.user.optionalPhone ?? '');
  const [phonePublic, setPhonePublic] = useState(session?.user.phonePublic ?? false);
  const [avatarRef, setAvatarRef] = useState<BuiltInAvatarRef>(
    builtInAvatarRefs.find(item => item === session?.user.avatarRef) ?? 'animal-01',
  );
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    getMyProfile()
      .then(user => {
        setDisplayName(user.displayName ?? '');
        setUsername(user.username ?? '');
        setPhone(user.optionalPhone ?? '');
        setPhonePublic(user.phonePublic ?? false);
        setAvatarRef(builtInAvatarRefs.find(item => item === user.avatarRef) ?? 'animal-01');
      })
      .catch(nextError => setError(t(authErrorKey(nextError))));
  }, [t]);

  async function saveProfile(): Promise<void> {
    if (isSaving || !session) {
      return;
    }

    if (!displayName.trim() || displayName.trim().length > 80) {
      setError(t('validationDisplayName'));
      return;
    }

    if (!usernamePattern.test(username.trim())) {
      setError(t('validationUsername'));
      return;
    }

    setError('');
    setStatus('');
    setIsSaving(true);
    try {
      const profileUser = await updateMyProfile({
        displayName,
        optionalPhone: phone || null,
        phonePublic: phone.trim() ? phonePublic : false,
        avatarRef,
      });
      await saveSession({ ...session, user: profileUser });

      const nextUser =
        username.trim() === profileUser.username
          ? profileUser
          : await updateUsername(username);

      if (nextUser !== profileUser) {
        await saveSession({ ...session, user: nextUser });
      }
      setStatus(t('profileUpdated'));
    } catch (nextError) {
      setError(t(authErrorKey(nextError)));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AccountScreenLayout description={t('profileDetails')} title={t('editProfile')}>
      <View style={[sharedStyles.elevatedCard, accountStyles.card]}>
        <Text style={accountStyles.label}>{t('editAvatar')}</Text>
        <Text style={accountStyles.hint}>{t('avatarSelectionDescription')}</Text>
        <View style={styles.avatarGrid}>
          {builtInAvatarRefs.map(ref => {
            const selected = avatarRef === ref;
            return (
              <Pressable
                accessibilityLabel={`${t('editAvatar')} ${ref}`}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                key={ref}
                onPress={() => setAvatarRef(ref)}
                style={({ pressed }) => [
                  styles.avatarOption,
                  selected && styles.avatarOptionSelected,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.avatarEmoji}>{avatarEmoji(ref)}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={accountStyles.label}>{t('displayName')}</Text>
        <TextInput
          accessibilityLabel={t('displayName')}
          autoCapitalize="words"
          maxLength={80}
          onChangeText={setDisplayName}
          placeholder={t('displayNamePlaceholder')}
          placeholderTextColor={colors.textFaint}
          style={accountStyles.input}
          value={displayName}
        />

        <Text style={accountStyles.label}>{t('username')}</Text>
        <TextInput
          accessibilityLabel={t('username')}
          autoCapitalize="none"
          maxLength={32}
          onChangeText={setUsername}
          placeholder={t('usernamePlaceholder')}
          placeholderTextColor={colors.textFaint}
          style={accountStyles.input}
          value={username}
        />
        <Text style={accountStyles.hint}>{t('usernameHint')}</Text>

        <Text style={accountStyles.label}>{t('phone')}</Text>
        <TextInput
          accessibilityLabel={t('phone')}
          autoComplete="tel"
          keyboardType="phone-pad"
          onChangeText={setPhone}
          placeholder={t('phonePlaceholder')}
          placeholderTextColor={colors.textFaint}
          style={accountStyles.input}
          textContentType="telephoneNumber"
          value={phone}
        />
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: phonePublic, disabled: !phone.trim() }}
          disabled={!phone.trim()}
          onPress={() => setPhonePublic(current => !current)}
          style={({ pressed }) => [
            styles.visibilityRow,
            !phone.trim() && styles.disabled,
            pressed && phone.trim() && styles.pressed,
          ]}
        >
          <View style={styles.visibilityCopy}>
            <Text style={styles.visibilityTitle}>{t('phoneVisibility')}</Text>
            <Text style={styles.visibilityDescription}>{t('phoneVisibilityDescription')}</Text>
          </View>
          <View style={[styles.switchTrack, phonePublic && styles.switchTrackActive]}>
            <View style={[styles.switchThumb, phonePublic && styles.switchThumbActive]} />
          </View>
        </Pressable>

        {status ? <Text accessibilityRole="alert" style={accountStyles.success}>{status}</Text> : null}
        {error ? <Text accessibilityRole="alert" style={accountStyles.error}>{error}</Text> : null}
        <View style={styles.saveButton}>
          <PrimaryButton
            disabled={isSaving}
            label={isSaving ? t('savingChanges') : t('saveChanges')}
            onPress={saveProfile}
          />
        </View>
      </View>
    </AccountScreenLayout>
  );
}

const styles = StyleSheet.create({
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  avatarOption: {
    alignItems: 'center',
    backgroundColor: colors.input,
    borderColor: colors.glassBorder,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  avatarOptionSelected: {
    backgroundColor: 'rgba(74, 168, 240, 0.2)',
    borderColor: colors.primary,
  },
  avatarEmoji: {
    fontSize: 24,
  },
  visibilityRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    minHeight: 48,
  },
  visibilityCopy: {
    flex: 1,
  },
  visibilityTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  visibilityDescription: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 2,
  },
  switchTrack: {
    backgroundColor: colors.input,
    borderColor: colors.glassBorder,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    height: 30,
    justifyContent: 'center',
    padding: 3,
    width: 52,
  },
  switchTrackActive: {
    backgroundColor: colors.primaryStrong,
    borderColor: colors.primaryStrong,
  },
  switchThumb: {
    backgroundColor: colors.textFaint,
    borderRadius: 12,
    height: 22,
    width: 22,
  },
  switchThumbActive: {
    alignSelf: 'flex-end',
    backgroundColor: colors.canvas,
  },
  saveButton: {
    marginTop: spacing.lg,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.76,
  },
});
