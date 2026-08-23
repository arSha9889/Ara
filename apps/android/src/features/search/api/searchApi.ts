import { apiClient } from '../../../infrastructure/http/apiClient';

export interface PublicUserProfile {
  display_name: string;
  username: string;
  avatar_type: string;
  avatar_ref: string;
  optional_phone: string | null;
}

export interface PublicUser {
  id: string;
  is_official: boolean;
  profile: PublicUserProfile | null;
}

export function normalizeUserSearchQuery(query: string): string {
  return query.trim().replace(/^@/, '');
}

export function searchPublicUsers(query: string): Promise<PublicUser[]> {
  const normalizedQuery = normalizeUserSearchQuery(query);

  return apiClient.request<PublicUser[]>(
    `/api/users/search?query=${encodeURIComponent(normalizedQuery)}`,
  );
}
