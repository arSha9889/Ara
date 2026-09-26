import { act, create } from 'react-test-renderer';
import { Linking } from 'react-native';

import { getAndroidRelease } from '../src/features/settings/updateApi';
import { SettingsScreen } from '../src/features/settings/screens/SettingsScreen';

const mockAndroidInstallSource = jest.fn();
const mockAppVersionCode = jest.fn();
const mockGetAndroidRelease = getAndroidRelease as jest.Mock;
const mockOpenUrl = Linking.openURL as jest.MockedFunction<typeof Linking.openURL>;

const translations: Record<string, string> = {
  appUpdateAvailable: 'Доступно обновление',
  appUpdateDirectDescription: 'Откройте официальный сайт AraChat, чтобы скачать новую версию.',
  appUpdateDirectHint: 'Открывает официальную страницу загрузки AraChat',
  appUpdateOpenDownloadPage: 'Открыть страницу загрузки',
  appUpdateUnknownSourceDescription: 'Безопасную ссылку на обновление мы не можем предложить.',
};

jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
  Linking: { openURL: jest.fn() },
  Pressable: 'Pressable',
  StyleSheet: { create: (styles: object) => styles, hairlineWidth: 1 },
  Text: 'Text',
  View: 'View',
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock('../src/config/runtimeConfig', () => ({
  androidInstallSource: (...args: unknown[]) => mockAndroidInstallSource(...args),
  appVersionCode: () => mockAppVersionCode(),
}));

jest.mock('../src/features/auth/session/useSession', () => ({
  useSession: () => ({
    saveSession: jest.fn(),
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
    setLanguage: jest.fn(),
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
  updateMyProfile: jest.fn(),
}));

jest.mock('../src/features/notifications/MobilePushProvider', () => ({
  useMobilePush: () => ({
    enableNotifications: jest.fn(),
    status: 'unsupported',
  }),
}));

jest.mock('../src/features/settings/updateApi', () => ({
  getAndroidRelease: jest.fn(),
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
  mockAndroidInstallSource.mockReset();
  mockAppVersionCode.mockReset();
  mockGetAndroidRelease.mockReset();
  mockOpenUrl.mockReset();
  mockAppVersionCode.mockReturnValue(41);
  mockOpenUrl.mockResolvedValue(undefined);
});

it('opens only the server-configured official direct-download page for a direct APK', async () => {
  const directDownloadUrl = 'https://downloads.example.test/android';
  mockAndroidInstallSource.mockReturnValue('direct');
  mockGetAndroidRelease.mockResolvedValue({
    latestVersionCode: 42,
    directDownloadUrl,
    rustoreAppUrl: 'https://store.example.test/arachat',
    rustoreInstallerPackage: 'ru.vk.store',
  });

  const component = await renderSettingsScreen();
  const action = component.root.findByProps({ testID: 'app-update-action' });

  expect(action.props.accessibilityRole).toBe('link');
  expect(action.props.accessibilityLabel).toBe(translations.appUpdateOpenDownloadPage);
  expect(action.props.accessibilityHint).toBe(translations.appUpdateDirectHint);

  await act(async () => {
    action.props.onPress();
    await settleAsyncWork();
  });

  expect(mockOpenUrl).toHaveBeenCalledWith(directDownloadUrl);

  await act(async () => {
    component.unmount();
  });
});

it('shows a neutral notice without an update action for an unknown installation source', async () => {
  mockAndroidInstallSource.mockReturnValue('unknown');
  mockGetAndroidRelease.mockResolvedValue({
    latestVersionCode: 42,
    directDownloadUrl: 'https://downloads.example.test/android',
    rustoreAppUrl: 'https://store.example.test/arachat',
    rustoreInstallerPackage: 'ru.vk.store',
  });

  const component = await renderSettingsScreen();

  expect(component.root.findByProps({ testID: 'app-update-card' })).toBeDefined();
  expect(component.root.findAllByProps({ testID: 'app-update-action' })).toHaveLength(0);
  expect(JSON.stringify(component.toJSON())).toContain(
    translations.appUpdateUnknownSourceDescription,
  );
  expect(mockOpenUrl).not.toHaveBeenCalled();

  await act(async () => {
    component.unmount();
  });
});
