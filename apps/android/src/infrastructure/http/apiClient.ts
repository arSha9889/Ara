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
    profile?: { display_name?: unknown; username?: unknown; email?: unknown } | null;
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
        : undefined,
    username:
      typeof user.profile?.username === 'string' ? user.profile.username : undefined,
    email: typeof user.profile?.email === 'string' ? user.profile.email : undefined,
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
    throw new ApiError('Request failed.', response.status);
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

export const apiClient = new ApiClient(sessionStore);
