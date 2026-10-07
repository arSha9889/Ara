import { apiClient } from '../../../infrastructure/http/apiClient';

export interface CallIceServer {
  urls: string[];
  username: string;
  credential: string;
}

export interface CallIceConfiguration {
  ice_servers: CallIceServer[];
  ice_transport_policy: 'relay';
  expires_at: string;
}

export interface CallHistoryPeer {
  id: string;
  display_name: string;
  username: string;
  avatar_type: string;
  avatar_ref: string;
  is_official: boolean;
}

export type CallHistoryOutcome = 'completed' | 'cancelled' | 'rejected' | 'busy' | 'failed';

export interface CallHistoryItem {
  id: string;
  call_id: string;
  chat_id: string;
  call_type: 'audio' | 'video';
  direction: 'incoming' | 'outgoing';
  outcome: CallHistoryOutcome;
  peer: CallHistoryPeer;
  started_at: string;
  connected_at: string | null;
  ended_at: string;
  duration_seconds: number | null;
}

export function getCallIceConfiguration(): Promise<CallIceConfiguration> {
  return apiClient.request<CallIceConfiguration>('/api/calls/ice-servers');
}

export function getCallHistory(): Promise<CallHistoryItem[]> {
  return apiClient.request<CallHistoryItem[]>('/api/calls/history');
}
