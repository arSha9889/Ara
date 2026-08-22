import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ChatScreen, type ChatRouteParams } from '../features/chats/screens/ChatScreen';
import { colors } from '../theme/theme';
import { MainTabs } from './MainTabs';

export type RootStackParamList = {
  MainTabs: undefined;
  Chat: ChatRouteParams;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.canvas,
    border: colors.glassBorder,
    card: colors.canvasMuted,
    primary: colors.primary,
    text: colors.text,
  },
};

export function AppNavigator() {
  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen component={MainTabs} name="MainTabs" />
        <Stack.Screen component={ChatScreen} name="Chat" />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
