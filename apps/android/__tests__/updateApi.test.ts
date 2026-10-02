import { apiClient } from '../src/infrastructure/http/apiClient';
import { getAndroidRelease } from '../src/features/settings/updateApi';

jest.mock('../src/infrastructure/http/apiClient', () => ({
  apiClient: {
    request: jest.fn(),
  },
}));

const request = apiClient.request as jest.Mock;

const releaseMetadata = {
  latest_version_name: '1.4.0',
  release_notes: ['Ответы на сообщения', 'Закреплённые сообщения'],
};

beforeEach(() => {
  request.mockReset();
});

it('accepts a direct APK update channel from the server', async () => {
  request.mockResolvedValue({
    latest_version_code: 42,
    ...releaseMetadata,
    direct_download_url: 'https://downloads.example.test/android',
    rustore_app_url: null,
    rustore_installer_package: null,
  });

  await expect(getAndroidRelease()).resolves.toEqual({
    latestVersionCode: 42,
    latestVersionName: '1.4.0',
    releaseNotes: ['Ответы на сообщения', 'Закреплённые сообщения'],
    directDownloadUrl: 'https://downloads.example.test/android',
    rustoreAppUrl: null,
    rustoreInstallerPackage: null,
  });
  expect(request).toHaveBeenCalledWith('/api/releases/android');
});

it('accepts a RuStore-only update channel from the server', async () => {
  request.mockResolvedValue({
    latest_version_code: 43,
    ...releaseMetadata,
    direct_download_url: null,
    rustore_app_url: 'https://store.example.test/arachat',
    rustore_installer_package: 'ru.vk.store',
  });

  await expect(getAndroidRelease()).resolves.toEqual({
    latestVersionCode: 43,
    latestVersionName: '1.4.0',
    releaseNotes: ['Ответы на сообщения', 'Закреплённые сообщения'],
    directDownloadUrl: null,
    rustoreAppUrl: 'https://store.example.test/arachat',
    rustoreInstallerPackage: 'ru.vk.store',
  });
});

it.each([
  [
    'has no public update channel',
    {
      latest_version_code: 42,
      ...releaseMetadata,
      direct_download_url: null,
      rustore_app_url: null,
    },
  ],
  [
    'contains an insecure direct download URL',
    {
      latest_version_code: 42,
      ...releaseMetadata,
      direct_download_url: 'http://downloads.example.test/android',
      rustore_app_url: 'https://store.example.test/arachat',
    },
  ],
  [
    'contains a query-bearing RuStore URL',
    {
      latest_version_code: 42,
      ...releaseMetadata,
      direct_download_url: 'https://downloads.example.test/android',
      rustore_app_url: 'https://store.example.test/arachat?source=app',
    },
  ],
  [
    'has an invalid version code',
    {
      latest_version_code: 0,
      ...releaseMetadata,
      direct_download_url: 'https://downloads.example.test/android',
    },
  ],
  [
    'has no version name',
    {
      latest_version_code: 42,
      release_notes: ['Исправления'],
      direct_download_url: 'https://downloads.example.test/android',
    },
  ],
  [
    'has empty release notes',
    {
      latest_version_code: 42,
      latest_version_name: '1.4.0',
      release_notes: ['  '],
      direct_download_url: 'https://downloads.example.test/android',
    },
  ],
])('does not advertise an update when metadata %s', async (_description, response) => {
  request.mockResolvedValue(response);

  await expect(getAndroidRelease()).resolves.toBeNull();
});
