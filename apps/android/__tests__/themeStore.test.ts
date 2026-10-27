import * as Keychain from 'react-native-keychain';

import { ThemeStore } from '../src/theme/themeStore';

const keychain = Keychain as jest.Mocked<typeof Keychain>;

describe('ThemeStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('restores a valid persisted preference', async () => {
    keychain.getGenericPassword.mockResolvedValue({
      password: 'light',
      service: 'arachat.messenger.theme',
      storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH,
      username: 'theme',
    });

    await expect(new ThemeStore().load('system')).resolves.toBe('light');
  });

  it('uses the fallback for an absent or invalid preference', async () => {
    keychain.getGenericPassword.mockResolvedValue(false);
    await expect(new ThemeStore().load('dark')).resolves.toBe('dark');

    keychain.getGenericPassword.mockResolvedValue({
      password: 'neon',
      service: 'arachat.messenger.theme',
      storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH,
      username: 'theme',
    });
    await expect(new ThemeStore().load('system')).resolves.toBe('system');
  });

  it('stores the preference in a device-only Keychain entry', async () => {
    await new ThemeStore().save('dark');

    expect(keychain.setGenericPassword).toHaveBeenCalledWith(
      'theme',
      'dark',
      expect.objectContaining({
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        service: 'arachat.messenger.theme',
      }),
    );
  });
});
