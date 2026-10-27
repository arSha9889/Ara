import { act, create } from 'react-test-renderer';

import { AppUpdateScreen } from '../src/features/settings/screens/AppUpdateScreen';

const mockOpenUrl = jest.fn();
const mockAppUpdate = {
  isUpdateAvailable: true,
  release: {
    latestVersionCode: 42,
    latestVersionName: '1.4.0',
    releaseNotes: ['Ответы на сообщения', 'Закреплённые сообщения'],
    directDownloadUrl: 'https://downloads.example.test/android',
    rustoreAppUrl: 'https://store.example.test/arachat',
    rustoreInstallerPackage: 'ru.vk.store',
  },
  source: 'direct' as 'direct' | 'rustore' | 'unknown',
};

jest.mock('react-native', () => ({
  Image: 'Image',
  Linking: { openURL: (...args: unknown[]) => mockOpenUrl(...args) },
  Pressable: 'Pressable',
  StyleSheet: { create: <T extends object>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
}));

jest.mock('../src/localization/I18nProvider', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('../src/ui/Icon', () => ({
  Icon: 'Icon',
}));

jest.mock('../src/features/account/components/AccountScreenLayout', () => ({
  AccountScreenLayout: 'AccountScreenLayout',
}));

jest.mock('../src/features/settings/AppUpdateProvider', () => ({
  useAppUpdate: () => mockAppUpdate,
}));

beforeEach(() => {
  mockOpenUrl.mockReset();
  mockOpenUrl.mockResolvedValue(undefined);
  mockAppUpdate.isUpdateAvailable = true;
  mockAppUpdate.source = 'direct';
});

test('shows version and release notes, then opens the official direct page', async () => {
  let component: ReturnType<typeof create> | undefined;

  await act(async () => {
    component = create(<AppUpdateScreen />);
  });

  const renderer = component as ReturnType<typeof create>;

  expect(JSON.stringify(renderer.toJSON())).toContain('1.4.0');
  expect(JSON.stringify(renderer.toJSON())).toContain('Ответы на сообщения');
  expect(JSON.stringify(renderer.toJSON())).toContain('Закреплённые сообщения');

  await act(async () => {
    renderer.root.findByProps({ testID: 'app-update-action' }).props.onPress();
  });

  expect(mockOpenUrl).toHaveBeenCalledWith('https://downloads.example.test/android');
});

test('does not expose an update link for an unknown installer source', async () => {
  mockAppUpdate.source = 'unknown';
  let component: ReturnType<typeof create> | undefined;

  await act(async () => {
    component = create(<AppUpdateScreen />);
  });

  const renderer = component as ReturnType<typeof create>;

  expect(renderer.root.findAllByProps({ testID: 'app-update-action' })).toHaveLength(0);
});
