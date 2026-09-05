import { apiClient } from '../../../infrastructure/http/apiClient';

export const SUPPORT_CATEGORIES = [
  'account',
  'security',
  'messages',
  'notifications',
  'bug',
  'suggestion',
  'other',
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];
export type SupportTicketStatus = 'new' | 'in_progress' | 'waiting_user' | 'resolved' | 'closed';

export interface SupportMessage {
  id: string;
  ticket_id: string;
  author_user_id: string | null;
  text: string;
  created_at: string;
}

export interface SupportTicket {
  id: string;
  number: number;
  category: SupportCategory;
  subject: string;
  status: SupportTicketStatus;
  requester_user_id: string;
  last_message_preview: string | null;
  last_message_at: string;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupportTicketDetail extends SupportTicket {
  messages: SupportMessage[];
}

export function getSupportTickets(): Promise<SupportTicket[]> {
  return apiClient.request<SupportTicket[]>('/api/support');
}

export function getSupportTicket(ticketId: string): Promise<SupportTicketDetail> {
  return apiClient.request<SupportTicketDetail>(`/api/support/${encodeURIComponent(ticketId)}`);
}

export function createSupportTicket(
  category: SupportCategory,
  subject: string,
  message: string,
): Promise<SupportTicketDetail> {
  return apiClient.request<SupportTicketDetail>('/api/support', {
    method: 'POST',
    body: {
      category,
      subject: subject.trim(),
      message: message.trim(),
    },
  });
}

export function createSupportMessage(
  ticketId: string,
  text: string,
): Promise<SupportTicketDetail> {
  return apiClient.request<SupportTicketDetail>(
    `/api/support/${encodeURIComponent(ticketId)}/messages`,
    {
      method: 'POST',
      body: { text: text.trim() },
    },
  );
}
