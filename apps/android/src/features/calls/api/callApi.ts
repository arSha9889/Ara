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

export function getCallIceConfiguration(): Promise<CallIceConfiguration> {
  return apiClient.request<CallIceConfiguration>('/api/calls/ice-servers');
}
