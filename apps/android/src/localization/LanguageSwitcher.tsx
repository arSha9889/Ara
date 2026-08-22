import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../theme/theme';
import { useI18n } from './I18nProvider';

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useI18n();

  return (
    <View accessibilityLabel={t('language')} style={styles.container}>
      <LanguageOption
        active={language === 'ru'}
        label={t('languageRussian')}
        onPress={() => setLanguage('ru')}
      />
      <LanguageOption
        active={language === 'en'}
        label={t('languageEnglish')}
        onPress={() => setLanguage('en')}
      />
    </View>
  );
}

function LanguageOption({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.option, active && styles.optionActive, pressed && styles.pressed]}
    >
      <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    backgroundColor: colors.input,
    borderColor: colors.glassBorder,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    padding: 3,
  },
  option: {
    borderRadius: 10,
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
  },
  optionActive: {
    backgroundColor: 'rgba(133, 214, 255, 0.18)',
  },
  optionLabel: {
    color: colors.textFaint,
    fontSize: 13,
    fontWeight: '600',
  },
  optionLabelActive: {
    color: colors.text,
  },
  pressed: {
    opacity: 0.78,
  },
});
