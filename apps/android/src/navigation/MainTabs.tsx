import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet } from 'react-native';

import { CallsScreen } from '../features/calls/screens/CallsScreen';
import { ChatsScreen } from '../features/chats/screens/ChatsScreen';
import { ProfileScreen } from '../features/profile/screens/ProfileScreen';
import { SearchScreen } from '../features/search/screens/SearchScreen';
import { SettingsScreen } from '../features/settings/screens/SettingsScreen';
import { useI18n } from '../localization/I18nProvider';
import { colors } from '../theme/theme';
import { Icon, type IconName } from '../ui/Icon';

export type MainTabParamList = {
  Chats: undefined;
  Calls: undefined;
  Search: { mode?: 'call' } | undefined;
  Profile: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

function TabIcon({ color, name }: { color: string; name: IconName }) {
  return <Icon color={color} name={name} size={23} />;
}

function ChatsTabIcon({ color }: { color: string }) {
  return <TabIcon color={color} name="chats" />;
}

function CallsTabIcon({ color }: { color: string }) {
  return <TabIcon color={color} name="call" />;
}

function SearchTabIcon({ color }: { color: string }) {
  return <TabIcon color={color} name="search" />;
}

function ProfileTabIcon({ color }: { color: string }) {
  return <TabIcon color={color} name="profile" />;
}

function SettingsTabIcon({ color }: { color: string }) {
  return <TabIcon color={color} name="settings" />;
}

export function MainTabs() {
  const { t } = useI18n();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        sceneStyle: styles.scene,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: styles.tabBar,
      }}
      >
      <Tab.Screen component={ChatsScreen} name="Chats" options={{ title: t('chats'), tabBarIcon: ChatsTabIcon }} />
      <Tab.Screen component={CallsScreen} name="Calls" options={{ title: t('calls'), tabBarIcon: CallsTabIcon }} />
      <Tab.Screen component={SearchScreen} name="Search" options={{ title: t('search'), tabBarIcon: SearchTabIcon }} />
      <Tab.Screen component={ProfileScreen} name="Profile" options={{ title: t('profile'), tabBarIcon: ProfileTabIcon }} />
      <Tab.Screen component={SettingsScreen} name="Settings" options={{ title: t('settings'), tabBarIcon: SettingsTabIcon }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  scene: {
    backgroundColor: colors.canvas,
  },
  tabBar: {
    backgroundColor: colors.glass,
    borderTopColor: colors.borderSubtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 0,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 1,
  },
});
