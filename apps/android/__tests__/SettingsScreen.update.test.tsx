import { act, create } from 'react-test-renderer';

import { SettingsScreen } from '../src/features/settings/screens/SettingsScreen';

const mockSaveSession = jest.fn();
const mockSetLanguage = jest.fn();
const mockUpdateMyProfile = jest.fn();
const mockUpdateSessionUser = jest.fn();
const mockNavigate = jest.fn();
const mockAppUpdate = {
  isUpdateAvailable: false,
  release: null as {
    latestVersionCode: number;
    latestVersionName: string;
    releaseNotes: string[];
    directDownloadUrl: string | null;
    rustoreAppUrl: string | null;
    rustoreInstallerPackage: string | null;
  } | null,
};

const translations: Record<string, string> = {
  appUpdateAvailable: 'Доступно обновление',
  appUpdateOpenCenterDescription: 'Посмотрите изменения и безопасный способ обновления.',
  appUpdateOpenCenterHint: 'Открывает подробности обновления AraChat',
};

jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
  Pressable: 'Pressable',
  StyleSheet: { create: (styles: object) => styles, hairlineWidth: 1 },
  Text: 'Text',
  View: 'View',
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: (...args: unknown[]) => mockNavigate(...args) }),
}));

jest.mock('../src/features/auth/session/useSession', () => ({
  useSession: () => ({
    saveSession: (...args: unknown[]) => mockSaveSession(...args),
    updateSessionUser: (...args: unknown[]) => mockUpdateSessionUser(...args),
    session: { user: { id: '0af0a8bd-9381-4778-95a8-82bf59b1ef2f' } },
    signOut: jest.fn(),
  }),
}));

jest.mock('../src/infrastructure/storage/sessionStore', () => ({
  sessionStore: { clearSession: jest.fn() },
}));

jest.mock('../src/features/chats/media/mediaClient', () => ({
  clearPrivateChatMediaCache: jest.fn(),
}));

jest.mock('../src/localization/I18nProvider', () => ({
  useI18n: () => ({
    setLanguage: (...args: unknown[]) => mockSetLanguage(...args),
    t: (key: string) => translations[key] ?? key,
  }),
}));

jest.mock('../src/localization/LanguageSwitcher', () => ({
  LanguageSwitcher: 'LanguageSwitcher',
}));

jest.mock('../src/ui/AppScreen', () => ({
  AppScreen: 'AppScreen',
}));

jest.mock('../src/ui/Icon', () => ({
  Icon: 'Icon',
}));

jest.mock('../src/features/account/api/accountApi', () => ({
  deleteAccount: jest.fn(),
  updateMyProfile: (...args: unknown[]) => mockUpdateMyProfile(...args),
}));

jest.mock('../src/features/notifications/MobilePushProvider', () => ({
  useMobilePush: () => ({ status: 'unsupported' }),
}));

jest.mock('../src/features/settings/updateApi', () => ({
  getAndroidRelease: jest.fn(),
}));

jest.mock('../src/features/settings/AppUpdateProvider', () => ({
  useAppUpdate: () => mockAppUpdate,
}));

function settleAsyncWork(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

async function renderSettingsScreen() {
  let component: ReturnType<typeof create> | undefined;

  await act(async () => {
    component = create(<SettingsScreen />);
    await settleAsyncWork();
  });

  return component!;
}

beforeEach(() => {
  mockNavigate.mockReset();
  mockSaveSession.mockReset();
  mockSetLanguage.mockReset();
  mockUpdateMyProfile.mockReset();
  mockUpdateSessionUser.mockReset();
  mockSetLanguage.mockResolvedValue(undefined);
  mockUpdateSessionUser.mockResolvedValue(undefined);
  mockAppUpdate.isUpdateAvailable = false;
  mockAppUpdate.release = null;
});

it('opens the shared update center when a server-advertised update is available', async () => {
  mockAppUpdate.isUpdateAvailable = true;
  mockAppUpdate.release = {
    latestVersionCode: 42,
    latestVersionName: '1.4.0',
    releaseNotes: ['Ответы на сообщения'],
    directDownloadUrl: 'https://downloads.example.test/android',
    rustoreAppUrl: 'https://store.example.test/arachat',
    rustoreInstallerPackage: 'ru.vk.store',
  };

  const component = await renderSettingsScreen();
  const card = component.root.findByProps({ testID: 'app-update-card' });

  expect(card.props.accessibilityRole).toBe('button');
  expect(card.props.accessibilityLabel).toBe(translations.appUpdateAvailable);
  expect(card.props.accessibilityHint).toBe(translations.appUpdateOpenCenterHint);

  act(() => {
    card.props.onPress();
  });

  expect(mockNavigate).toHaveBeenCalledWith('AppUpdate');

  await act(async () => {
    component.unmount();
  });
});

it('does not render an update entry when no update is available', async () => {
  const component = await renderSettingsScreen();

  expect(component.root.findAllByProps({ testID: 'app-update-card' })).toHaveLength(0);

  await act(async () => {
    component.unmount();
  });
});

it('updates only the profile part of the active session after changing language', async () => {
  const updatedUser = {
    id: '0af0a8bd-9381-4778-95a8-82bf59b1ef2f',
    language: 'en',
  };
  mockUpdateMyProfile.mockResolvedValue(updatedUser);

  const component = await renderSettingsScreen();
  const languageSwitcher = component.root.findByType('LanguageSwitcher' as never);

  await act(async () => {
    await languageSwitcher.props.onLanguageChange('en');
  });

  expect(mockSetLanguage).toHaveBeenCalledWith('en');
  expect(mockUpdateMyProfile).toHaveBeenCalledWith({ language: 'en' });
  expect(mockUpdateSessionUser).toHaveBeenCalledWith(updatedUser);
  expect(mockSaveSession).not.toHaveBeenCalled();

  await act(async () => {
    component.unmount();
  });
});
