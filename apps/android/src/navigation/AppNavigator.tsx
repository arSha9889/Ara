import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ChatScreen, type ChatRouteParams } from '../features/chats/screens/ChatScreen';
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
import { colors } from '../theme/theme';
import { MainTabs } from './MainTabs';

export type RootStackParamList = {
  MainTabs: undefined;
  Chat: ChatRouteParams;
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
