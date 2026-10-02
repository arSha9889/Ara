import { useEffect, useState } from 'react';
import { AccessibilityInfo, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, sharedStyles, spacing } from '../theme/theme';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import type { AppLanguage } from './language';
import { useI18n } from './I18nProvider';

interface LanguageSwitcherProps {
  onLanguageChange?(language: AppLanguage): void | Promise<void>;
}

const languageOptions: readonly {
  code: AppLanguage;
  labelKey: 'languageRussian' | 'languageEnglish';
}[] = [
  { code: 'ru', labelKey: 'languageRussian' },
  { code: 'en', labelKey: 'languageEnglish' },
];

export function LanguageSwitcher({ onLanguageChange }: LanguageSwitcherProps) {
  const { language, setLanguage, t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(value => {
        if (active) {
          setReduceMotion(value);
        }
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  function selectLanguage(nextLanguage: AppLanguage): void {
    setIsOpen(false);

    if (nextLanguage === language) {
      return;
    }

    try {
      const update = onLanguageChange ? onLanguageChange(nextLanguage) : setLanguage(nextLanguage);
      Promise.resolve(update).catch(() => undefined);
    } catch {
      // The caller is responsible for any user-facing synchronization error.
    }
  }

  return (
    <>
      <Pressable
        accessibilityLabel={`${t('language')}: ${t(language === 'ru' ? 'languageRussian' : 'languageEnglish')}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        onPress={() => setIsOpen(true)}
        style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}
      >
        <Text style={styles.triggerLabel}>
          {t(language === 'ru' ? 'languageRussian' : 'languageEnglish')}
        </Text>
        <Icon color={colors.primary} name="chevronDown" size={18} />
      </Pressable>

      <Modal
        animationType={reduceMotion ? 'none' : 'fade'}
        onRequestClose={() => setIsOpen(false)}
        statusBarTranslucent
        transparent
        visible={isOpen}
      >
        <View style={styles.overlay}>
          <Pressable
            accessibilityLabel={t('close')}
            accessibilityRole="button"
            onPress={() => setIsOpen(false)}
            style={styles.backdrop}
          />
          <View
            accessibilityViewIsModal
            accessibilityLabel={t('language')}
            style={[sharedStyles.glassPanel, styles.dialog]}
          >
            <View style={styles.heading}>
              <View style={styles.headingCopy}>
                <Text style={styles.title}>{t('language')}</Text>
                <Text style={styles.description}>{t('languageDescription')}</Text>
              </View>
              <IconButton
                accessibilityLabel={t('close')}
                icon="close"
                onPress={() => setIsOpen(false)}
              />
            </View>

            <View accessibilityRole="radiogroup" style={styles.options}>
              {languageOptions.map(option => {
                const selected = option.code === language;

                return (
                  <Pressable
                    accessibilityLabel={t(option.labelKey)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    key={option.code}
                    onPress={() => selectLanguage(option.code)}
                    style={({ pressed }) => [
                      styles.option,
                      selected && styles.optionSelected,
                      pressed && styles.optionPressed,
                    ]}
                  >
                    <View accessible={false} style={[styles.radio, selected && styles.radioSelected]}>
                      {selected ? <View style={styles.radioDot} /> : null}
                    </View>
                    <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                      {t(option.labelKey)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.input,
    borderColor: colors.glassBorder,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 48,
    paddingHorizontal: spacing.sm,
  },
  triggerPressed: {
    backgroundColor: colors.surfacePressed,
  },
  triggerLabel: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  overlay: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  backdrop: {
    backgroundColor: 'rgba(4, 10, 18, 0.34)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  dialog: {
    backgroundColor: colors.glassStrong,
    maxWidth: 420,
    padding: spacing.lg,
    width: '100%',
  },
  heading: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  headingCopy: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  description: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  options: {
    gap: spacing.xs,
    marginTop: spacing.lg,
  },
  option: {
    alignItems: 'center',
    backgroundColor: colors.input,
    borderColor: colors.glassBorder,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.sm,
  },
  optionSelected: {
    backgroundColor: 'rgba(74, 168, 240, 0.2)',
    borderColor: colors.primaryStrong,
  },
  optionPressed: {
    backgroundColor: colors.surfacePressed,
  },
  radio: {
    borderColor: colors.textFaint,
    borderRadius: 9,
    borderWidth: 1.5,
    height: 18,
    justifyContent: 'center',
    width: 18,
  },
  radioSelected: {
    borderColor: colors.primary,
  },
  radioDot: {
    alignSelf: 'center',
    backgroundColor: colors.primary,
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  optionLabel: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: '600',
  },
  optionLabelSelected: {
    color: colors.text,
  },
});
