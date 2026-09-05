import { apiClient } from '../../../infrastructure/http/apiClient';

export type ReportReason = 'spam' | 'abuse' | 'harassment' | 'violence' | 'sexual_content' | 'fraud' | 'other';
export type ReportStatus = 'open' | 'under_review' | 'resolved' | 'dismissed';

export interface BlockedUser {
  user_id: string;
  display_name: string;
  username: string;
  avatar_type: string;
  avatar_ref: string;
  blocked_at: string;
}

export interface ContentReport {
  id: string;
  target_type: 'user' | 'message' | 'comment';
  target_id: string;
  reason: ReportReason;
  description: string | null;
  status: ReportStatus;
  created_at: string;
  updated_at: string;
}

export function getBlockedUsers(): Promise<BlockedUser[]> {
  return apiClient.request<BlockedUser[]>('/api/safety/blocks');
}

export function blockUser(userId: string): Promise<BlockedUser> {
  return apiClient.request<BlockedUser>(`/api/safety/blocks/${encodeURIComponent(userId)}`, {
    method: 'POST',
  });
}

export function unblockUser(userId: string): Promise<{ ok: boolean }> {
  return apiClient.request<{ ok: boolean }>(`/api/safety/blocks/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
}

export function getMyReports(): Promise<ContentReport[]> {
  return apiClient.request<ContentReport[]>('/api/safety/reports');
}

export function submitUserReport(
  userId: string,
  reason: ReportReason,
  description?: string,
): Promise<ContentReport> {
  return apiClient.request<ContentReport>('/api/safety/reports', {
    method: 'POST',
    body: {
      target_type: 'user',
      target_id: userId,
      reason,
      ...(description?.trim() ? { description: description.trim() } : {}),
    },
  });
}
