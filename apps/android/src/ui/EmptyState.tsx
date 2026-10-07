import { StyleSheet, Text, View } from 'react-native';

import { colors, sharedStyles, spacing } from '../theme/theme';
import { Icon, type IconName } from './Icon';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: IconName;
}

export function EmptyState({ title, description, icon = 'chats' }: EmptyStateProps) {
  return (
    <View style={[sharedStyles.glassCard, styles.card]}>
      <View accessibilityElementsHidden style={styles.orb}>
        <Icon color={colors.primary} name={icon} size={24} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 216,
    padding: spacing.lg,
  },
  orb: {
    alignItems: 'center',
    backgroundColor: 'rgba(140, 201, 255, 0.12)',
    borderColor: 'rgba(140, 201, 255, 0.32)',
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    marginBottom: spacing.md,
    width: 44,
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
