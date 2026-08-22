import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet, Text } from 'react-native';

import { ChatsScreen } from '../features/chats/screens/ChatsScreen';
import { ProfileScreen } from '../features/profile/screens/ProfileScreen';
import { SearchScreen } from '../features/search/screens/SearchScreen';
import { SettingsScreen } from '../features/settings/screens/SettingsScreen';
import { useI18n } from '../localization/I18nProvider';
import { colors } from '../theme/theme';

type MainTabParamList = {
  Chats: undefined;
  Search: undefined;
  Profile: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

function TabIcon({ color, symbol }: { color: string; symbol: string }) {
  return <Text style={[styles.tabIcon, { color }]}>{symbol}</Text>;
}

function ChatsTabIcon({ color }: { color: string }) {
  return <TabIcon color={color} symbol="◌" />;
}

function SearchTabIcon({ color }: { color: string }) {
  return <TabIcon color={color} symbol="⌕" />;
}

function ProfileTabIcon({ color }: { color: string }) {
  return <TabIcon color={color} symbol="○" />;
}

function SettingsTabIcon({ color }: { color: string }) {
  return <TabIcon color={color} symbol="⚙" />;
}

export function MainTabs() {
  const { t } = useI18n();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        sceneStyle: styles.scene,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarItemStyle: styles.tabItem,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: styles.tabBar,
      }}
    >
      <Tab.Screen component={ChatsScreen} name="Chats" options={{ title: t('chats'), tabBarIcon: ChatsTabIcon }} />
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
    backgroundColor: colors.canvasMuted,
    borderTopColor: colors.glassBorder,
    height: 76,
    paddingBottom: 8,
    paddingTop: 8,
  },
  tabItem: {
    minHeight: 48,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  tabIcon: {
    fontSize: 21,
    fontWeight: '600',
  },
});
