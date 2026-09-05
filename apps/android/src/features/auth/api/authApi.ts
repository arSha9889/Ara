import { apiClient } from '../../../infrastructure/http/apiClient';
import type { AuthSession, SessionUser } from '../../../infrastructure/storage/sessionStore';

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: ApiUser;
}

export interface ApiUser {
  id: string;
  nexus_id: string;
  status: string;
  legal_documents_current: boolean;
  profile?: {
    display_name?: string;
    username?: string;
    email?: string;
    email_verified?: boolean;
    avatar_type?: string;
    avatar_ref?: string;
    optional_phone?: string | null;
    phone_public?: boolean;
    language?: string;
  } | null;
}

interface EmailVerificationStartResponse {
  verification_id: string;
}

interface EmailVerificationConfirmResponse {
  email: string;
}

export interface RegistrationInput {
  emailVerificationId: string;
  username: string;
  password: string;
  displayName: string;
  deviceId: string;
  language: 'ru' | 'en';
}

export function toSessionUser(user: ApiUser): SessionUser {
  return {
    id: user.id,
    nexusId: user.nexus_id,
    status: user.status,
    legalDocumentsCurrent: user.legal_documents_current,
    displayName: user.profile?.display_name,
    username: user.profile?.username,
    email: user.profile?.email,
    emailVerified: user.profile?.email_verified,
    avatarType: user.profile?.avatar_type,
    avatarRef: user.profile?.avatar_ref,
    optionalPhone: user.profile?.optional_phone ?? undefined,
    phonePublic: user.profile?.phone_public,
    language:
      user.profile?.language === 'ru' || user.profile?.language === 'en'
        ? user.profile.language
        : undefined,
  };
}

export async function loginWithPassword(
  identifier: string,
  password: string,
  deviceId: string,
): Promise<AuthSession> {
  const response = await apiClient.request<LoginResponse>('/api/auth/login', {
    method: 'POST',
    requiresAuth: false,
    body: {
      identifier: identifier.trim(),
      password,
      device_id: deviceId,
    },
  });

  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    user: toSessionUser(response.user),
  };
}

export async function startEmailVerification(
  email: string,
  deviceId: string,
  language: 'ru' | 'en',
): Promise<EmailVerificationStartResponse> {
  return apiClient.request<EmailVerificationStartResponse>('/api/auth/email-verification/start', {
    method: 'POST',
    requiresAuth: false,
    body: { email: email.trim(), device_id: deviceId, language },
  });
}

export async function confirmEmailVerification(
  verificationId: string,
  code: string,
): Promise<EmailVerificationConfirmResponse> {
  return apiClient.request<EmailVerificationConfirmResponse>('/api/auth/email-verification/confirm', {
    method: 'POST',
    requiresAuth: false,
    body: { verification_id: verificationId, code },
  });
}

export async function completeRegistration(input: RegistrationInput): Promise<AuthSession> {
  const response = await apiClient.request<LoginResponse>('/api/auth/register/complete', {
    method: 'POST',
    requiresAuth: false,
    body: {
      email_verification_id: input.emailVerificationId,
      username: input.username,
      password: input.password,
      device_id: input.deviceId,
      language: input.language,
      registration_country: 'GLOBAL',
      design_theme: 'halo',
      display_name: input.displayName.trim() || undefined,
      avatar_type: 'built_in',
      avatar_ref: 'animal-01',
      accepted_terms: true,
      accepted_privacy_policy: true,
    },
  });

  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    user: toSessionUser(response.user),
  };
}

export async function startPasswordReset(
  email: string,
  deviceId: string,
  language: 'ru' | 'en',
): Promise<void> {
  await apiClient.request('/api/auth/password/reset/start', {
    method: 'POST',
    requiresAuth: false,
    body: { email: email.trim(), device_id: deviceId, language },
  });
}

export async function confirmPasswordReset(
  email: string,
  code: string,
  newPassword: string,
  deviceId: string,
): Promise<void> {
  await apiClient.request('/api/auth/password/reset/confirm', {
    method: 'POST',
    requiresAuth: false,
    body: {
      email: email.trim(),
      code,
      new_password: newPassword,
      device_id: deviceId,
    },
  });
}

export async function acceptCurrentLegalDocuments(): Promise<SessionUser> {
  const response = await apiClient.request<ApiUser>('/api/auth/legal-documents/accept', {
    method: 'POST',
    body: { accepted_terms: true, accepted_privacy_policy: true },
  });

  return toSessionUser(response);
}

export async function logout(refreshToken: string): Promise<void> {
  await apiClient.request<void>('/api/auth/logout', {
    method: 'POST',
    requiresAuth: false,
    body: { refresh_token: refreshToken },
  });
}
