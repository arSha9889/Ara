import { act, create } from 'react-test-renderer';

import { MobilePushProvider, useMobilePush } from '../src/features/notifications/MobilePushProvider';

const mockGetNotificationPermissionStatus = jest.fn();
const mockGetMobilePushTokens = jest.fn();
const mockPushClientIsAvailable = jest.fn();
const mockRegisterMobilePushToken = jest.fn();
const mockRequestNotificationPermission = jest.fn();
const mockSubscribeToMobilePushToken = jest.fn();

jest.mock('../src/features/auth/session/useSession', () => ({
  useSession: () => ({
    session: {
      user: { legalDocumentsCurrent: true },
    },
  }),
}));

jest.mock('../src/infrastructure/storage/sessionStore', () => ({
  sessionStore: {
    getDeviceId: jest.fn().mockResolvedValue('test-device-id'),
  },
}));

jest.mock('../src/features/notifications/api/mobilePushApi', () => ({
  registerMobilePushToken: (...args: unknown[]) => mockRegisterMobilePushToken(...args),
}));

jest.mock('../src/features/notifications/pushClient', () => ({
  getMobilePushTokens: () => mockGetMobilePushTokens(),
  getNotificationPermissionStatus: () => mockGetNotificationPermissionStatus(),
  pushClientIsAvailable: () => mockPushClientIsAvailable(),
  requestNotificationPermission: () => mockRequestNotificationPermission(),
  subscribeToMobilePushToken: (...args: unknown[]) => mockSubscribeToMobilePushToken(...args),
}));

let mobilePush:
  | {
      status: string;
      enableNotifications(): Promise<void>;
    }
  | undefined;

function PushStatusProbe() {
  mobilePush = useMobilePush();
  return null;
}

describe('MobilePushProvider', () => {
  beforeEach(() => {
    mobilePush = undefined;
    jest.clearAllMocks();
    mockGetNotificationPermissionStatus.mockResolvedValue('denied');
    mockPushClientIsAvailable.mockReturnValue(true);
    mockSubscribeToMobilePushToken.mockReturnValue(() => undefined);
  });

  it('keeps notification permission enabled when token synchronization fails', async () => {
    mockRequestNotificationPermission.mockResolvedValue('granted');
    mockGetMobilePushTokens.mockResolvedValue([{ provider: 'fcm', token: 'f'.repeat(32) }]);
    mockRegisterMobilePushToken.mockRejectedValue(new Error('Mobile token endpoint is unavailable'));

    let component: ReturnType<typeof create> | undefined;
    await act(async () => {
      component = create(
        <MobilePushProvider>
          <PushStatusProbe />
        </MobilePushProvider>,
      );
    });

    const currentMobilePush = mobilePush;
    if (!currentMobilePush) {
      throw new Error('Push context was not rendered.');
    }

    await act(async () => {
      await currentMobilePush.enableNotifications();
    });

    expect(mobilePush?.status).toBe('enabled');

    await act(async () => {
      await Promise.resolve();
    });

    expect(mobilePush?.status).toBe('enabled');

    await act(async () => {
      component?.unmount();
    });
  });
});
