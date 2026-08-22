import { StyleSheet, Text, View } from 'react-native';

import { colors, sharedStyles, spacing } from '../theme/theme';

interface EmptyStateProps {
  title: string;
  description: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <View style={[sharedStyles.glassCard, styles.card]}>
      <View style={styles.orb} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 232,
    padding: spacing.lg,
  },
  orb: {
    backgroundColor: 'rgba(133, 214, 255, 0.16)',
    borderColor: 'rgba(133, 214, 255, 0.56)',
    borderRadius: 24,
    borderWidth: 1,
    height: 48,
    marginBottom: spacing.md,
    width: 48,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  description: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
