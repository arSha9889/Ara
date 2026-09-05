import { apiClient } from '../src/infrastructure/http/apiClient';
import {
  createSupportMessage,
  createSupportTicket,
  getSupportTicket,
  getSupportTickets,
} from '../src/features/support/api/supportApi';

jest.mock('../src/infrastructure/http/apiClient', () => ({
  apiClient: {
    request: jest.fn(),
  },
}));

const request = apiClient.request as jest.Mock;

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue({});
});

test('uses the support ticket endpoints and trims user text', async () => {
  await getSupportTickets();
  await createSupportTicket('bug', '  Application crashes  ', '  Happens after sign in.  ');
  await getSupportTicket('ticket-1');
  await createSupportMessage('ticket-1', '  I can provide more details.  ');

  expect(request).toHaveBeenNthCalledWith(1, '/api/support');
  expect(request).toHaveBeenNthCalledWith(2, '/api/support', {
    method: 'POST',
    body: {
      category: 'bug',
      subject: 'Application crashes',
      message: 'Happens after sign in.',
    },
  });
  expect(request).toHaveBeenNthCalledWith(3, '/api/support/ticket-1');
  expect(request).toHaveBeenNthCalledWith(4, '/api/support/ticket-1/messages', {
    method: 'POST',
    body: { text: 'I can provide more details.' },
  });
});
