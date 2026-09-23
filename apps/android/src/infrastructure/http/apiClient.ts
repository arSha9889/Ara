import { getApiBaseUrl } from '../../config/runtimeConfig';
import {
  sessionStore,
  type AuthSession,
  type SecureSessionStore,
  type SessionUser,
} from '../storage/sessionStore';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  requiresAuth?: boolean;
  skipRefresh?: boolean;
  signal?: AbortSignal;
}

export interface ApiMultipartRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  formData: FormData;
  requiresAuth?: boolean;
  skipRefresh?: boolean;
  signal?: AbortSignal;
}

interface RefreshResponse {
  access_token: string;
  refresh_token: string;
  user?: unknown;
}

function endpoint(path: string): string {
  return `${getApiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}

function sessionUser(value: unknown, fallback: SessionUser): SessionUser {
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const user = value as {
    id?: unknown;
    nexus_id?: unknown;
    status?: unknown;
    legal_documents_current?: unknown;
    profile?: {
      display_name?: unknown;
      username?: unknown;
      email?: unknown;
      email_verified?: unknown;
      avatar_type?: unknown;
      avatar_ref?: unknown;
      optional_phone?: unknown;
      phone_public?: unknown;
      language?: unknown;
    } | null;
  };

  if (
    typeof user.id !== 'string' ||
    typeof user.nexus_id !== 'string' ||
    typeof user.status !== 'string'
  ) {
    return fallback;
  }

  return {
    id: user.id,
    nexusId: user.nexus_id,
    status: user.status,
    legalDocumentsCurrent:
      typeof user.legal_documents_current === 'boolean'
        ? user.legal_documents_current
        : fallback.legalDocumentsCurrent,
    displayName:
      typeof user.profile?.display_name === 'string'
        ? user.profile.display_name
        : fallback.displayName,
    username:
      typeof user.profile?.username === 'string' ? user.profile.username : fallback.username,
    email: typeof user.profile?.email === 'string' ? user.profile.email : fallback.email,
    emailVerified:
      typeof user.profile?.email_verified === 'boolean'
        ? user.profile.email_verified
        : fallback.emailVerified,
    avatarType:
      typeof user.profile?.avatar_type === 'string' ? user.profile.avatar_type : fallback.avatarType,
    avatarRef:
      typeof user.profile?.avatar_ref === 'string' ? user.profile.avatar_ref : fallback.avatarRef,
    optionalPhone:
      typeof user.profile?.optional_phone === 'string'
        ? user.profile.optional_phone
        : user.profile && 'optional_phone' in user.profile
          ? undefined
          : fallback.optionalPhone,
    phonePublic:
      typeof user.profile?.phone_public === 'boolean'
        ? user.profile.phone_public
        : fallback.phonePublic,
    language:
      user.profile?.language === 'ru' || user.profile?.language === 'en'
        ? user.profile.language
        : fallback.language,
  };
}

function jsonHeaders(headers: Record<string, string> = {}): Record<string, string> {
  return {
    Accept: 'application/json',
    ...headers,
  };
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let code: string | undefined;

    try {
      const payload = (await response.json()) as { code?: unknown };
      code = typeof payload.code === 'string' ? payload.code : undefined;
    } catch {
      // Errors can be empty or served outside the JSON API contract.
    }

    throw new ApiError('Request failed.', response.status, code);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export class ApiClient {
  private refreshPromise: Promise<AuthSession | null> | null = null;

  constructor(private readonly store: SecureSessionStore) {}

  async request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const requiresAuth = options.requiresAuth ?? true;
    const session = requiresAuth ? await this.store.loadSession() : null;

    if (requiresAuth && !session) {
      throw new ApiError('Authentication required.', 401);
    }

    let response = await this.send(path, options, session?.accessToken);

    if (
      response.status === 401 &&
      requiresAuth &&
      !options.skipRefresh &&
      session
    ) {
      const refreshed = await this.refreshSession(session);
      if (refreshed) {
        response = await this.send(path, options, refreshed.accessToken);
      }
    }

    return parseResponse<T>(response);
  }

  async requestMultipart<T>(
    path: string,
    options: ApiMultipartRequestOptions,
  ): Promise<T> {
    const requiresAuth = options.requiresAuth ?? true;
    const session = requiresAuth ? await this.store.loadSession() : null;

    if (requiresAuth && !session) {
      throw new ApiError('Authentication required.', 401);
    }

    let response = await this.sendMultipart(path, options, session?.accessToken);

    if (
      response.status === 401 &&
      requiresAuth &&
      !options.skipRefresh &&
      session
    ) {
      const refreshed = await this.refreshSession(session);
      if (refreshed) {
        response = await this.sendMultipart(path, options, refreshed.accessToken);
      }
    }

    return parseResponse<T>(response);
  }

  async withAuthRetry<T>(operation: (accessToken: string) => Promise<T>): Promise<T> {
    const session = await this.store.loadSession();

    if (!session) {
      throw new ApiError('Authentication required.', 401);
    }

    try {
      return await operation(session.accessToken);
    } catch (error) {
      if (!isUnauthorizedTransportError(error)) {
        throw error;
      }

      const refreshed = await this.refreshSession(session);
      if (!refreshed) {
        throw error;
      }
      return operation(refreshed.accessToken);
    }
  }

  private async send(
    path: string,
    options: ApiRequestOptions,
    accessToken?: string,
  ): Promise<Response> {
    const headers = jsonHeaders(options.headers);
    let body: string | undefined;

    if (options.body !== undefined) {
      headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
      body = JSON.stringify(options.body);
    }

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    return fetch(endpoint(path), {
      method: options.method ?? 'GET',
      headers,
      body,
      signal: options.signal,
    });
  }

  private async sendMultipart(
    path: string,
    options: ApiMultipartRequestOptions,
    accessToken?: string,
  ): Promise<Response> {
    const headers = jsonHeaders(options.headers);

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    return fetch(endpoint(path), {
      method: options.method ?? 'POST',
      headers,
      body: options.formData,
      signal: options.signal,
    });
  }

  private async refreshSession(session: AuthSession): Promise<AuthSession | null> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.performRefresh(session).finally(() => {
        this.refreshPromise = null;
      });
    }

    return this.refreshPromise;
  }

  private async performRefresh(session: AuthSession): Promise<AuthSession | null> {
    let response: Response;

    try {
      response = await this.send('/api/auth/refresh', {
        method: 'POST',
        body: { refresh_token: session.refreshToken },
        requiresAuth: false,
      });
    } catch {
      return null;
    }

    if (response.status === 401 || response.status === 403) {
      await this.store.clearSession();
      return null;
    }

    if (!response.ok) {
      return null;
    }

    const refreshed = (await response.json()) as RefreshResponse;
    if (
      typeof refreshed.access_token !== 'string' ||
      typeof refreshed.refresh_token !== 'string'
    ) {
      await this.store.clearSession();
      return null;
    }

    const nextSession: AuthSession = {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      user: sessionUser(refreshed.user, session.user),
    };
    await this.store.saveSession(nextSession);
    return nextSession;
  }
}

function isUnauthorizedTransportError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status === 401;
  }

  return (
    Boolean(error) &&
    typeof error === 'object' &&
    (error as { code?: unknown }).code === 'MEDIA_UNAUTHORIZED'
  );
}

export const apiClient = new ApiClient(sessionStore);
