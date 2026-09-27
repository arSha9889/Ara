import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '../../../localization/I18nProvider';
import { type AppLanguage } from '../../../localization/language';
import { colors, sharedStyles, spacing } from '../../../theme/theme';
import { AppScreen } from '../../../ui/AppScreen';
import { HaloMark } from '../../../ui/HaloMark';
import { Icon } from '../../../ui/Icon';
import { PrimaryButton } from '../../../ui/PrimaryButton';
import { RegistrationCountryFlag } from '../components/RegistrationCountryFlag';
import {
  registrationCountryOptions,
  type RegistrationCountry,
} from '../registrationCountry';

interface RegistrationSetupScreenProps {
  onBack(): void;
  onContinue(country: RegistrationCountry): void;
}

const languageOptions: readonly {
  code: AppLanguage;
  labelKey: 'languageRussian' | 'languageEnglish';
}[] = [
  { code: 'ru', labelKey: 'languageRussian' },
  { code: 'en', labelKey: 'languageEnglish' },
];

export function RegistrationSetupScreen({ onBack, onContinue }: RegistrationSetupScreenProps) {
  const { language, setLanguage, t } = useI18n();
  const [country, setCountry] = useState<RegistrationCountry | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<AppLanguage>(language);
  const [isContinuing, setIsContinuing] = useState(false);

  function selectLanguage(nextLanguage: AppLanguage): void {
    setSelectedLanguage(nextLanguage);
  }

  async function continueToRegistration(): Promise<void> {
    if (!country || isContinuing) {
      return;
    }

    setIsContinuing(true);
    try {
      if (selectedLanguage !== language) {
        await setLanguage(selectedLanguage);
      }
      onContinue(country);
    } catch (error) {
      setIsContinuing(false);
      throw error;
    }
  }

  return (
    <AppScreen contentStyle={styles.content}>
      <Pressable
        accessibilityLabel={t('backToSignIn')}
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
      >
        <Icon color={colors.textMuted} name="back" size={20} />
        <Text style={styles.backLabel}>{t('backToSignIn')}</Text>
      </Pressable>

      <View style={styles.hero}>
        <HaloMark size={72} />
        <Text style={styles.brand}>AraChat</Text>
      </View>

      <View style={[sharedStyles.elevatedCard, styles.card]}>
        <Text style={sharedStyles.eyebrow}>{t('registrationSetupEyebrow')}</Text>
        <Text style={styles.title}>{t('registrationSetupTitle')}</Text>
        <Text style={styles.description}>{t('registrationSetupDescription')}</Text>

        <Text style={styles.sectionLabel}>{t('registrationCountryLabel')}</Text>
        <Text style={styles.sectionDescription}>{t('registrationCountryDescription')}</Text>
        <View accessibilityRole="radiogroup" style={styles.countryOptions}>
          {registrationCountryOptions.map(option => {
            const selected = option.code === country;

            return (
              <Pressable
                accessibilityLabel={t(option.labelKey)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                key={option.code}
                onPress={() => setCountry(option.code)}
                style={({ pressed }) => [
                  styles.countryOption,
                  selected && styles.countryOptionSelected,
                  pressed && styles.countryOptionPressed,
                ]}
              >
                <RegistrationCountryFlag country={option.code} />
                <Text style={styles.countryName}>{t(option.labelKey)}</Text>
                <Text style={styles.countryCode}>{option.code}</Text>
                <View style={[styles.selectionMark, selected && styles.selectionMarkSelected]}>
                  {selected ? <Icon color={colors.canvas} name="check" size={16} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>{t('registrationLanguageLabel')}</Text>
        <View accessibilityRole="radiogroup" style={styles.languageOptions}>
          {languageOptions.map(option => {
            const selected = option.code === selectedLanguage;

            return (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                key={option.code}
                onPress={() => selectLanguage(option.code)}
                style={({ pressed }) => [
                  styles.languageOption,
                  selected && styles.languageOptionSelected,
                  pressed && styles.languageOptionPressed,
                ]}
              >
                <View style={[styles.languageRadio, selected && styles.languageRadioSelected]}>
                  {selected ? <View style={styles.languageRadioDot} /> : null}
                </View>
                <Text style={[styles.languageLabel, selected && styles.languageLabelSelected]}>
                  {t(option.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.action}>
          <PrimaryButton
            accessibilityHint={country ? undefined : t('registrationCountryRequired')}
            disabled={!country || isContinuing}
            label={t('continue')}
            onPress={() => {
              continueToRegistration().catch(() => undefined);
            }}
          />
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    alignSelf: 'center',
    maxWidth: 560,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
    width: '100%',
  },
  backButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 48,
    paddingHorizontal: spacing.xs,
  },
  backLabel: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  hero: {
    alignItems: 'center',
    marginBottom: spacing.lg,
    marginTop: spacing.xs,
  },
  brand: {
    color: colors.text,
    fontSize: 27,
    fontWeight: '700',
    letterSpacing: -0.65,
    marginTop: spacing.sm,
  },
  card: {
    backgroundColor: colors.surfaceRaised,
    padding: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginTop: spacing.sm,
  },
  description: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: spacing.xs,
  },
  sectionLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    marginTop: spacing.lg,
  },
  sectionDescription: {
    color: colors.textFaint,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.xxs,
  },
  countryOptions: {
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  countryOption: {
    alignItems: 'center',
    backgroundColor: colors.input,
    borderColor: colors.glassBorder,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 64,
    paddingHorizontal: spacing.sm,
  },
  countryOptionSelected: {
    backgroundColor: 'rgba(74, 168, 240, 0.12)',
    borderColor: colors.primaryStrong,
  },
  countryOptionPressed: {
    backgroundColor: colors.surfacePressed,
  },
  countryName: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  countryCode: {
    color: colors.textFaint,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  selectionMark: {
    alignItems: 'center',
    borderColor: colors.textFaint,
    borderRadius: 12,
    borderWidth: 1.5,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  selectionMarkSelected: {
    backgroundColor: colors.primaryStrong,
    borderColor: colors.primaryStrong,
  },
  languageOptions: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  languageOption: {
    alignItems: 'center',
    backgroundColor: colors.input,
    borderColor: colors.glassBorder,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.sm,
  },
  languageOptionSelected: {
    backgroundColor: 'rgba(74, 168, 240, 0.12)',
    borderColor: colors.primaryStrong,
  },
  languageOptionPressed: {
    backgroundColor: colors.surfacePressed,
  },
  languageRadio: {
    borderColor: colors.textFaint,
    borderRadius: 8,
    borderWidth: 1.5,
    height: 16,
    justifyContent: 'center',
    width: 16,
  },
  languageRadioSelected: {
    borderColor: colors.primary,
  },
  languageRadioDot: {
    alignSelf: 'center',
    backgroundColor: colors.primary,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  languageLabel: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  languageLabelSelected: {
    color: colors.text,
  },
  action: {
    marginTop: spacing.lg,
  },
  pressed: {
    opacity: 0.78,
  },
});
