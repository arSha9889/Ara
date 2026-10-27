import {
  createNavigationContainerRef,
  DarkTheme,
  NavigationContainer,
  type NavigatorScreenParams,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useState } from 'react';

import { ChatScreen, type ChatRouteParams } from '../features/chats/screens/ChatScreen';
import { GroupChatScreen, type GroupChatRouteParams } from '../features/chats/screens/GroupChatScreen';
import { GroupCreateScreen } from '../features/chats/screens/GroupCreateScreen';
import { GroupDetailsScreen } from '../features/chats/screens/GroupDetailsScreen';
import { AccountCredentialsScreen } from '../features/account/screens/AccountCredentialsScreen';
import { DevicesScreen } from '../features/account/screens/DevicesScreen';
import { EmailChangeScreen } from '../features/account/screens/EmailChangeScreen';
import { LoginHistoryScreen } from '../features/account/screens/LoginHistoryScreen';
import { PasswordChangeScreen } from '../features/account/screens/PasswordChangeScreen';
import { PinSettingsScreen } from '../features/account/screens/PinSettingsScreen';
import { ProfileEditScreen } from '../features/profile/screens/ProfileEditScreen';
import { BlockedUsersScreen } from '../features/safety/screens/BlockedUsersScreen';
import { MyReportsScreen } from '../features/safety/screens/MyReportsScreen';
import { SupportTicketScreen } from '../features/support/screens/SupportTicketScreen';
import { SupportTicketsScreen } from '../features/support/screens/SupportTicketsScreen';
import { AppUpdateScreen } from '../features/settings/screens/AppUpdateScreen';
import { MobilePushNavigationHandler } from '../features/notifications/MobilePushNavigationHandler';
import { useTheme } from '../theme/ThemeProvider';
import { MainTabs, type MainTabParamList } from './MainTabs';

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  Chat: ChatRouteParams;
  GroupCreate: undefined;
  GroupChat: GroupChatRouteParams;
  GroupDetails: { chatId: string };
  BlockedUsers: undefined;
  MyReports: undefined;
  SupportTickets: undefined;
  SupportTicket: { ticketId: string };
  ProfileEdit: undefined;
  AccountCredentials: undefined;
  EmailChange: undefined;
  PasswordChange: undefined;
  PinSettings: undefined;
  Devices: undefined;
  LoginHistory: undefined;
  AppUpdate: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function AppNavigator() {
  const [isNavigationReady, setIsNavigationReady] = useState(false);
  const { colors, mode } = useTheme();
  const navigationTheme = {
    ...DarkTheme,
    dark: mode === 'dark',
    colors: {
      ...DarkTheme.colors,
      background: colors.canvas,
      border: colors.borderSubtle,
      card: colors.surface,
      primary: colors.accent,
      text: colors.text,
    },
  };

  return (
    <>
      <NavigationContainer
        onReady={() => setIsNavigationReady(true)}
        ref={navigationRef}
        theme={navigationTheme}
      >
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen component={MainTabs} name="MainTabs" />
          <Stack.Screen component={ChatScreen} name="Chat" />
          <Stack.Screen component={GroupCreateScreen} name="GroupCreate" />
          <Stack.Screen component={GroupChatScreen} name="GroupChat" />
          <Stack.Screen component={GroupDetailsScreen} name="GroupDetails" />
          <Stack.Screen component={BlockedUsersScreen} name="BlockedUsers" />
          <Stack.Screen component={MyReportsScreen} name="MyReports" />
          <Stack.Screen component={SupportTicketsScreen} name="SupportTickets" />
          <Stack.Screen component={SupportTicketScreen} name="SupportTicket" />
          <Stack.Screen component={ProfileEditScreen} name="ProfileEdit" />
          <Stack.Screen component={AccountCredentialsScreen} name="AccountCredentials" />
          <Stack.Screen component={EmailChangeScreen} name="EmailChange" />
          <Stack.Screen component={PasswordChangeScreen} name="PasswordChange" />
          <Stack.Screen component={PinSettingsScreen} name="PinSettings" />
          <Stack.Screen component={DevicesScreen} name="Devices" />
          <Stack.Screen component={LoginHistoryScreen} name="LoginHistory" />
          <Stack.Screen component={AppUpdateScreen} name="AppUpdate" />
        </Stack.Navigator>
      </NavigationContainer>
      {isNavigationReady ? <MobilePushNavigationHandler navigation={navigationRef} /> : null}
    </>
  );
}
