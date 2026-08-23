import { Linking, Pressable, StyleSheet, Text } from 'react-native';

import { colors, spacing } from '../../../theme/theme';

interface LegalDocumentLinkProps {
  label: string;
  onOpenError(): void;
  url: string;
}

export function LegalDocumentLink({ label, onOpenError, url }: LegalDocumentLinkProps) {
  async function openDocument(): Promise<void> {
    try {
      await Linking.openURL(url);
    } catch {
      onOpenError();
    }
  }

  return (
    <Pressable
      accessibilityRole="link"
      onPress={openDocument}
      style={({ pressed }) => [styles.link, pressed && styles.pressed]}
      testID="legal-document-link"
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
  },
  label: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    textDecorationLine: 'underline',
  },
  pressed: {
    opacity: 0.78,
  },
});
