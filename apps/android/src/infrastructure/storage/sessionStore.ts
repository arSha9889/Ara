import * as Keychain from 'react-native-keychain';
import { NativeModules } from 'react-native';

const SESSION_SERVICE = 'arachat.messenger.session';
const DEVICE_ID_SERVICE = 'arachat.messenger.device-id';
const NOTIFICATION_PERMISSION_REQUEST_SERVICE_PREFIX =
  'arachat.messenger.notification-permission-request';

export interface SessionUser {
  id: string;
  nexusId: string;
  status: string;
  legalDocumentsCurrent: boolean;
  displayName?: string;
  username?: string;
  email?: string;
  emailVerified?: boolean;
  avatarType?: string;
  avatarRef?: string;
  optionalPhone?: string;
  phonePublic?: boolean;
  language?: 'ru' | 'en';
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

type SessionListener = (session: AuthSession | null) => void;

interface AppConfigModule {
  createDeviceId?: () => Promise<string>;
}

function isSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const session = value as Partial<AuthSession>;
  return Boolean(
    typeof session.accessToken === 'string' &&
      session.accessToken &&
      typeof session.refreshToken === 'string' &&
      session.refreshToken &&
      session.user &&
      typeof session.user.id === 'string' &&
      typeof session.user.nexusId === 'string' &&
      typeof session.user.status === 'string' &&
      typeof session.user.legalDocumentsCurrent === 'boolean',
  );
}

async function createDeviceId(): Promise<string> {
  const module = NativeModules.AppConfig as AppConfigModule | undefined;

  if (!module?.createDeviceId) {
    throw new Error('Нативный генератор идентификатора устройства недоступен.');
  }

  const deviceId = await module.createDeviceId();
  if (typeof deviceId !== 'string' || deviceId.length < 8) {
    throw new Error('Нативный генератор вернул некорректный идентификатор устройства.');
  }

  return deviceId;
}

function notificationPermissionRequestService(userId: string): string {
  return `${NOTIFICATION_PERMISSION_REQUEST_SERVICE_PREFIX}.${encodeURIComponent(userId)}`;
}

export class SecureSessionStore {
  private readonly listeners = new Set<SessionListener>();
  private sessionMutation: Promise<void> = Promise.resolve();

  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async loadSession(): Promise<AuthSession | null> {
    await this.sessionMutation;
    return this.readSession();
  }

  async saveSession(session: AuthSession): Promise<void> {
    await this.enqueueSessionMutation(async () => {
      await this.persistSession(session);
      this.notify(session);
    });
  }

  async saveSessionIfCurrent(expected: AuthSession, nextSession: AuthSession): Promise<boolean> {
    return this.enqueueSessionMutation(async () => {
      const currentSession = await this.readSession();
      if (!isSameAuthenticationSession(currentSession, expected)) {
        return false;
      }

      await this.persistSession(nextSession);
      this.notify(nextSession);
      return true;
    });
  }

  async clearSession(): Promise<void> {
    await this.enqueueSessionMutation(async () => {
      await Keychain.resetGenericPassword({ service: SESSION_SERVICE });
      this.notify(null);
    });
  }

  async clearSessionIfCurrent(expected: AuthSession): Promise<boolean> {
    return this.enqueueSessionMutation(async () => {
      const currentSession = await this.readSession();
      if (!isSameAuthenticationSession(currentSession, expected)) {
        return false;
      }

      await Keychain.resetGenericPassword({ service: SESSION_SERVICE });
      this.notify(null);
      return true;
    });
  }

  async markNotificationPermissionRequest(userId: string): Promise<void> {
    await Keychain.setGenericPassword('notification-permission-request', 'pending', {
      service: notificationPermissionRequestService(userId),
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }

  async consumeNotificationPermissionRequest(userId: string): Promise<boolean> {
    const service = notificationPermissionRequestService(userId);
    const credentials = await Keychain.getGenericPassword({ service });

    if (!credentials) {
      return false;
    }

    await Keychain.resetGenericPassword({ service });
    return true;
  }

  async getDeviceId(): Promise<string> {
    const credentials = await Keychain.getGenericPassword({ service: DEVICE_ID_SERVICE });

    if (credentials && credentials.password.length >= 8) {
      return credentials.password;
    }

    const deviceId = await createDeviceId();
    await Keychain.setGenericPassword('device-id', deviceId, {
      service: DEVICE_ID_SERVICE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    return deviceId;
  }

  private async readSession(): Promise<AuthSession | null> {
    const credentials = await Keychain.getGenericPassword({ service: SESSION_SERVICE });

    if (!credentials) {
      return null;
    }

    try {
      const session = JSON.parse(credentials.password) as unknown;
      if (isSession(session)) {
        return session;
      }
    } catch {
      // A corrupted entry must not leave the application in an invalid auth state.
    }

    await Keychain.resetGenericPassword({ service: SESSION_SERVICE });
    return null;
  }

  private async persistSession(session: AuthSession): Promise<void> {
    await Keychain.setGenericPassword('session', JSON.stringify(session), {
      service: SESSION_SERVICE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }

  private async enqueueSessionMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.sessionMutation.then(operation, operation);
    this.sessionMutation = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private notify(session: AuthSession | null): void {
    this.listeners.forEach(listener => listener(session));
  }
}

function isSameAuthenticationSession(current: AuthSession | null, expected: AuthSession): boolean {
  return Boolean(
    current &&
      current.user.id === expected.user.id &&
      current.refreshToken === expected.refreshToken,
  );
}

export const sessionStore = new SecureSessionStore();
