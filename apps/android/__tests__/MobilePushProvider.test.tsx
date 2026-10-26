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
      user: {
        id: '2ed67eb4-9f7b-4880-b4c1-fabc6d32a541',
        legalDocumentsCurrent: true,
      },
    },
  }),
}));

jest.mock('../src/infrastructure/storage/sessionStore', () => ({
  sessionStore: {
    consumeNotificationPermissionRequest: jest.fn(),
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
    }
  | undefined;

const mockConsumeNotificationPermissionRequest =
  jest.requireMock('../src/infrastructure/storage/sessionStore').sessionStore
    .consumeNotificationPermissionRequest as jest.Mock;

function settleAsyncWork(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

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
    mockConsumeNotificationPermissionRequest.mockResolvedValue(false);
  });

  it('does not open a system permission dialog for an existing user', async () => {
    let component: ReturnType<typeof create> | undefined;
    await act(async () => {
      component = create(
        <MobilePushProvider>
          <PushStatusProbe />
        </MobilePushProvider>,
      );
      await settleAsyncWork();
    });

    expect(mobilePush?.status).toBe('disabled');
    expect(mockRequestNotificationPermission).not.toHaveBeenCalled();

    await act(async () => {
      component?.unmount();
    });
  });

  it('requests permission once for a newly registered user and keeps it enabled when token synchronization fails', async () => {
    mockRequestNotificationPermission.mockResolvedValue('granted');
    mockGetMobilePushTokens.mockResolvedValue([{ provider: 'rustore', token: 'r'.repeat(32) }]);
    mockRegisterMobilePushToken.mockRejectedValue(new Error('Mobile token endpoint is unavailable'));
    mockConsumeNotificationPermissionRequest.mockResolvedValue(true);

    let component: ReturnType<typeof create> | undefined;
    await act(async () => {
      component = create(
        <MobilePushProvider>
          <PushStatusProbe />
        </MobilePushProvider>,
      );
      await settleAsyncWork();
    });

    expect(mobilePush?.status).toBe('enabled');
    expect(mockRequestNotificationPermission).toHaveBeenCalledTimes(1);
    expect(mockRegisterMobilePushToken).toHaveBeenCalledWith(
      'test-device-id',
      { provider: 'rustore', token: 'r'.repeat(32) },
    );

    await act(async () => {
      component?.unmount();
    });
  });
});
