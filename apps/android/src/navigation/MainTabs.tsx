import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet } from 'react-native';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CallsScreen } from '../features/calls/screens/CallsScreen';
import { ChatsScreen } from '../features/chats/screens/ChatsScreen';
import { ProfileScreen } from '../features/profile/screens/ProfileScreen';
import { SearchScreen } from '../features/search/screens/SearchScreen';
import { SettingsScreen } from '../features/settings/screens/SettingsScreen';
import { useI18n } from '../localization/I18nProvider';
import { motion, radii, spacing, type AppColors } from '../theme/theme';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { AraGlassSurface } from '../ui/AraGlassSurface';
import { Icon, type IconName } from '../ui/Icon';
import { InterfaceIcon } from '../ui/InterfaceIcon';

export type MainTabParamList = {
  Chats: undefined;
  Calls: undefined;
  Search: { mode?: 'call' } | undefined;
  Profile: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

const tabIcons: Record<keyof MainTabParamList, IconName> = {
  Chats: 'chats',
  Calls: 'call',
  Search: 'search',
  Profile: 'profile',
  Settings: 'settings',
};

function renderAraTabBar(props: BottomTabBarProps) {
  return <AraTabBar {...props} />;
}

export function MainTabs() {
  const { t } = useI18n();
  const { colors } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.canvas },
      }}
      tabBar={renderAraTabBar}
      >
      <Tab.Screen component={ChatsScreen} name="Chats" options={{ title: t('chats') }} />
      <Tab.Screen component={CallsScreen} name="Calls" options={{ title: t('calls') }} />
      <Tab.Screen component={SearchScreen} name="Search" options={{ title: t('contacts') }} />
      <Tab.Screen component={ProfileScreen} name="Profile" options={{ title: t('profile') }} />
      <Tab.Screen component={SettingsScreen} name="Settings" options={{ title: t('settings') }} />
    </Tab.Navigator>
  );
}

function AraTabBar({ descriptors, navigation, state }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);

  return (
    <AraGlassSurface style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.xs) }]}>
      {state.routes.map((route, index) => {
        const selected = state.index === index;
        const options = descriptors[route.key].options;
        const label = typeof options.title === 'string' ? options.title : route.name;

        return (
          <AraTabBarItem
            icon={tabIcons[route.name as keyof MainTabParamList]}
            key={route.key}
            label={label}
            onPress={() => {
              const event = navigation.emit({ canPreventDefault: true, target: route.key, type: 'tabPress' });
              if (!selected && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            }}
            selected={selected}
          />
        );
      })}
    </AraGlassSurface>
  );
}

function AraTabBarItem({ icon, label, onPress, selected }: {
  icon: IconName;
  label: string;
  onPress(): void;
  selected: boolean;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [reduceMotion, setReduceMotion] = useState(false);
  const indicator = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(enabled => {
        if (active) {
          setReduceMotion(enabled);
        }
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    indicator.stopAnimation();
    if (reduceMotion) {
      indicator.setValue(selected ? 1 : 0);
      return;
    }
    Animated.timing(indicator, {
      duration: motion.quick,
      toValue: selected ? 1 : 0,
      useNativeDriver: true,
    }).start();
  }, [indicator, reduceMotion, selected]);

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.itemSelected,
          {
            opacity: indicator,
            transform: [{ scaleX: indicator }],
          },
        ]}
      />
      <View style={styles.itemContent}>
        {icon === 'settings' ? (
          <InterfaceIcon color={selected ? colors.accent : colors.textFaint} name="settings" size={20} />
        ) : (
          <Icon color={selected ? colors.accent : colors.textFaint} name={icon} size={21} />
        )}
        <Text numberOfLines={1} style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
      </View>
    </Pressable>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    bar: {
      alignItems: 'center',
      borderBottomWidth: 0,
      borderTopLeftRadius: radii.sheet,
      borderTopRightRadius: radii.sheet,
      flexDirection: 'row',
      minHeight: 68,
      paddingHorizontal: spacing.xs,
      paddingTop: spacing.sm,
    },
    item: {
      alignItems: 'center',
      borderRadius: radii.control,
      flex: 1,
      justifyContent: 'center',
      minHeight: 48,
      overflow: 'hidden',
      paddingHorizontal: 2,
      position: 'relative',
    },
    itemContent: {
      alignItems: 'center',
      gap: 2,
      justifyContent: 'center',
    },
    itemSelected: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.accentSubtle,
      borderRadius: radii.control,
    },
    itemPressed: { backgroundColor: colors.surfacePressed },
    label: { color: colors.textFaint, fontSize: 10, fontWeight: '700' },
    labelSelected: { color: colors.accent },
  });
}
