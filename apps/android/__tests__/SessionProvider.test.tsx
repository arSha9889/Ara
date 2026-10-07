import { act, create } from 'react-test-renderer';

import type {
  AuthSession,
  SessionUser,
} from '../src/infrastructure/storage/sessionStore';

const mockAcceptCurrentLegalDocuments = jest.fn();
const mockClearPrivateChatMediaCache = jest.fn();
const mockClearSessionIfCurrent = jest.fn();
const mockGetDeviceId = jest.fn();
const mockLoadSession = jest.fn();
const mockLogout = jest.fn();
const mockLoginWithPassword = jest.fn();
const mockMarkNotificationPermissionRequest = jest.fn();
const mockSaveSession = jest.fn();
const mockSubscribe = jest.fn();
const mockUnregisterMobilePushTokens = jest.fn();

jest.mock('../src/features/auth/api/authApi', () => ({
  acceptCurrentLegalDocuments: (...args: unknown[]) => mockAcceptCurrentLegalDocuments(...args),
  loginWithPassword: (...args: unknown[]) => mockLoginWithPassword(...args),
  logout: (...args: unknown[]) => mockLogout(...args),
}));

jest.mock('../src/features/chats/media/mediaClient', () => ({
  clearPrivateChatMediaCache: (...args: unknown[]) => mockClearPrivateChatMediaCache(...args),
}));

jest.mock('../src/features/notifications/api/mobilePushApi', () => ({
  unregisterMobilePushTokens: (...args: unknown[]) => mockUnregisterMobilePushTokens(...args),
}));

jest.mock('../src/infrastructure/storage/sessionStore', () => ({
  sessionStore: {
    getDeviceId: (...args: unknown[]) => mockGetDeviceId(...args),
    clearSessionIfCurrent: (...args: unknown[]) => mockClearSessionIfCurrent(...args),
    loadSession: (...args: unknown[]) => mockLoadSession(...args),
    markNotificationPermissionRequest: (...args: unknown[]) => mockMarkNotificationPermissionRequest(...args),
    saveSession: (...args: unknown[]) => mockSaveSession(...args),
    subscribe: (...args: unknown[]) => mockSubscribe(...args),
  },
}));

import { SessionProvider } from '../src/features/auth/session/SessionProvider';
import { useSession } from '../src/features/auth/session/useSession';

const initialSession: AuthSession = {
  accessToken: 'expired-access-token',
  refreshToken: 'expired-refresh-token',
  user: {
    id: 'user-1',
    nexusId: '1234567890123456',
    status: 'active',
    legalDocumentsCurrent: true,
    language: 'ru',
  },
};

const updatedUser: SessionUser = {
  ...initialSession.user,
  language: 'en',
};

let mockStoredSession: AuthSession | null = null;
let mockSessionListener: ((session: AuthSession | null) => void) | undefined;
let exposedSignIn: ((identifier: string, password: string) => Promise<void>) | undefined;
let exposedUpdateSessionUser: ((user: SessionUser) => Promise<void>) | undefined;
let exposedSignOut: (() => Promise<void>) | undefined;

function SessionProbe() {
  const session = useSession();
  exposedSignIn = session.signIn;
  exposedUpdateSessionUser = session.updateSessionUser;
  exposedSignOut = session.signOut;
  return null;
}

function settleAsyncWork(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

describe('SessionProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    exposedSignIn = undefined;
    exposedUpdateSessionUser = undefined;
    exposedSignOut = undefined;
    mockSessionListener = undefined;
    mockStoredSession = {
      ...initialSession,
      user: { ...initialSession.user },
    };
    mockLoadSession.mockImplementation(async () => mockStoredSession);
    mockSaveSession.mockImplementation(async (nextSession: AuthSession) => {
      mockStoredSession = nextSession;
      mockSessionListener?.(nextSession);
    });
    mockGetDeviceId.mockResolvedValue('device-id');
    mockMarkNotificationPermissionRequest.mockResolvedValue(undefined);
    mockUnregisterMobilePushTokens.mockResolvedValue(undefined);
    mockClearSessionIfCurrent.mockImplementation(async (expected: AuthSession) => {
      if (
        mockStoredSession?.user.id !== expected.user.id ||
        mockStoredSession?.refreshToken !== expected.refreshToken
      ) {
        return false;
      }
      mockStoredSession = null;
      mockSessionListener?.(null);
      return true;
    });
    mockSubscribe.mockImplementation((listener: (session: AuthSession | null) => void) => {
      mockSessionListener = listener;
      return () => {
        if (mockSessionListener === listener) {
          mockSessionListener = undefined;
        }
      };
    });
  });

  it('arms a notification permission request after a successful interactive sign-in', async () => {
    const signedInSession: AuthSession = {
      ...initialSession,
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      user: { ...initialSession.user, id: 'user-2', nexusId: '9876543210987654' },
    };
    mockLoginWithPassword.mockResolvedValue(signedInSession);

    let component!: ReturnType<typeof create>;
    await act(async () => {
      component = create(
        <SessionProvider>
          <SessionProbe />
        </SessionProvider>,
      );
      await settleAsyncWork();
    });

    await act(async () => {
      await exposedSignIn?.('user@example.com', 'secret');
    });

    expect(mockLoginWithPassword).toHaveBeenCalledWith('user@example.com', 'secret', 'device-id');
    expect(mockMarkNotificationPermissionRequest).toHaveBeenCalledWith('user-2');

    await act(async () => {
      component.unmount();
    });
  });

  it('preserves refreshed tokens when a profile update finishes afterwards', async () => {
    let component!: ReturnType<typeof create>;
    await act(async () => {
      component = create(
        <SessionProvider>
          <SessionProbe />
        </SessionProvider>,
      );
      await settleAsyncWork();
    });

    const refreshedSession: AuthSession = {
      ...initialSession,
      accessToken: 'refreshed-access-token',
      refreshToken: 'refreshed-refresh-token',
      user: { ...initialSession.user },
    };
    await act(async () => {
      mockStoredSession = refreshedSession;
      mockSessionListener?.(refreshedSession);
    });

    await act(async () => {
      await exposedUpdateSessionUser?.(updatedUser);
    });

    expect(mockSaveSession).toHaveBeenLastCalledWith({
      ...refreshedSession,
      user: updatedUser,
    });

    await act(async () => {
      component.unmount();
    });
  });

  it('does not overwrite another active user session', async () => {
    let component!: ReturnType<typeof create>;
    await act(async () => {
      component = create(
        <SessionProvider>
          <SessionProbe />
        </SessionProvider>,
      );
      await settleAsyncWork();
    });

    await expect(
      exposedUpdateSessionUser?.({ ...updatedUser, id: 'another-user' }),
    ).rejects.toThrow('Активная сессия');
    expect(mockSaveSession).not.toHaveBeenCalled();

    await act(async () => {
      component.unmount();
    });
  });

  it('does not clear a newer account after a delayed logout of the previous account', async () => {
    let resolveLogout!: () => void;
    mockLogout.mockReturnValue(new Promise<void>(resolve => {
      resolveLogout = resolve;
    }));
    let component!: ReturnType<typeof create>;
    await act(async () => {
      component = create(
        <SessionProvider>
          <SessionProbe />
        </SessionProvider>,
      );
      await settleAsyncWork();
    });

    const signOut = exposedSignOut;
    const signOutPromise = signOut?.();
    await act(async () => {
      await settleAsyncWork();
    });
    const newerSession: AuthSession = {
      ...initialSession,
      accessToken: 'access-token-b',
      refreshToken: 'refresh-token-b',
      user: { ...initialSession.user, id: 'user-b', nexusId: '9876543210987654' },
    };
    await act(async () => {
      mockStoredSession = newerSession;
      mockSessionListener?.(newerSession);
      resolveLogout();
      await signOutPromise;
    });

    expect(mockClearSessionIfCurrent).toHaveBeenCalledWith(initialSession);
    expect(mockStoredSession).toEqual(newerSession);

    await act(async () => {
      component.unmount();
    });
  });
});
