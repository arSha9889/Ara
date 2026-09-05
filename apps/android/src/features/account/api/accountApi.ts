import { apiClient } from '../../../infrastructure/http/apiClient';
import type { AppLanguage } from '../../../localization/language';
import { toSessionUser, type ApiUser } from '../../auth/api/authApi';
import type { SessionUser } from '../../../infrastructure/storage/sessionStore';
import type { BuiltInAvatarRef } from '../../profile/avatar';

export interface ProfileUpdateInput {
  displayName?: string;
  optionalPhone?: string | null;
  phonePublic?: boolean;
  avatarRef?: BuiltInAvatarRef;
  language?: AppLanguage;
}

interface VerificationStartResponse {
  verification_id: string;
  expires_in_seconds: number;
}

export interface DeviceSession {
  id: string;
  device_id: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface LoginHistoryItem {
  id: string;
  device_id: string | null;
  method: string;
  result: string;
  created_at: string;
}

export async function getMyProfile(): Promise<SessionUser> {
  const response = await apiClient.request<ApiUser>('/api/users/me');
  return toSessionUser(response);
}

export async function updateMyProfile(input: ProfileUpdateInput): Promise<SessionUser> {
  const body: Record<string, string | boolean | null> = {};

  if (input.displayName !== undefined) {
    body.display_name = input.displayName.trim();
  }
  if (input.optionalPhone !== undefined) {
    body.optional_phone = input.optionalPhone?.trim() || null;
  }
  if (input.phonePublic !== undefined) {
    body.phone_public = input.phonePublic;
  }
  if (input.avatarRef !== undefined) {
    body.avatar_type = 'built_in';
    body.avatar_ref = input.avatarRef;
  }
  if (input.language !== undefined) {
    body.language = input.language;
  }

  const response = await apiClient.request<ApiUser>('/api/users/me/profile', {
    method: 'PATCH',
    body,
  });
  return toSessionUser(response);
}

export async function updateUsername(username: string): Promise<SessionUser> {
  const response = await apiClient.request<ApiUser>('/api/users/username', {
    method: 'PATCH',
    body: { username: username.trim() },
  });
  return toSessionUser(response);
}

export function startPasswordChange(
  currentPassword: string,
  newPassword: string,
  deviceId: string,
  language: AppLanguage,
): Promise<VerificationStartResponse> {
  return apiClient.request<VerificationStartResponse>('/api/auth/password/change/start', {
    method: 'POST',
    body: {
      current_password: currentPassword,
      new_password: newPassword,
      device_id: deviceId,
      language,
    },
  });
}

export async function confirmPasswordChange(
  verificationId: string,
  code: string,
  deviceId: string,
): Promise<void> {
  await apiClient.request<void>('/api/auth/password/change/confirm', {
    method: 'POST',
    body: { verification_id: verificationId, code, device_id: deviceId },
  });
}

export function startEmailChange(
  currentPassword: string,
  email: string,
  deviceId: string,
  language: AppLanguage,
): Promise<VerificationStartResponse> {
  return apiClient.request<VerificationStartResponse>('/api/auth/email/change/start', {
    method: 'POST',
    body: {
      current_password: currentPassword,
      email: email.trim(),
      device_id: deviceId,
      language,
    },
  });
}

export async function confirmEmailChange(
  verificationId: string,
  code: string,
  deviceId: string,
): Promise<SessionUser> {
  const response = await apiClient.request<ApiUser>('/api/auth/email/change/confirm', {
    method: 'POST',
    body: { verification_id: verificationId, code, device_id: deviceId },
  });
  return toSessionUser(response);
}

export async function createPin(
  currentPassword: string,
  pin: string,
  deviceId: string,
): Promise<void> {
  await apiClient.request<void>('/api/security/pin/create', {
    method: 'POST',
    body: { current_password: currentPassword, pin, device_id: deviceId },
  });
}

export async function resetPin(
  currentPassword: string,
  pin: string | null,
  deviceId: string,
): Promise<void> {
  await apiClient.request<void>('/api/security/pin/reset', {
    method: 'POST',
    body: { current_password: currentPassword, pin, device_id: deviceId },
  });
}

export function getDeviceSessions(): Promise<DeviceSession[]> {
  return apiClient.request<DeviceSession[]>('/api/devices');
}

export async function revokeDeviceSession(deviceId: string): Promise<void> {
  await apiClient.request<void>(`/api/devices/${encodeURIComponent(deviceId)}`, {
    method: 'DELETE',
  });
}

export function getLoginHistory(): Promise<LoginHistoryItem[]> {
  return apiClient.request<LoginHistoryItem[]>('/api/login-history');
}

export async function deleteAccount(): Promise<void> {
  await apiClient.request<void>('/api/auth/account', { method: 'DELETE' });
}
