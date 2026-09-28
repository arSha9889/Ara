import { connectionStatusPresentation } from '../src/features/network/connectionStatusPresentation';

test('prioritizes a missing internet connection over realtime state', () => {
  expect(
    connectionStatusPresentation(
      { state: 'disconnected', transport: 'none' },
      'connected',
    ),
  ).toEqual({ icon: 'close', key: 'networkOffline', tone: 'danger' });
});

test('names Wi-Fi and mobile internet without claiming a mobile generation', () => {
  expect(
    connectionStatusPresentation(
      { state: 'connected', transport: 'wifi' },
      null,
    ),
  ).toEqual({ icon: 'check', key: 'networkConnectedWifi', tone: 'success' });
  expect(
    connectionStatusPresentation(
      { state: 'checking', transport: 'cellular' },
      null,
    ),
  ).toEqual({ icon: 'refresh', key: 'networkConnectingMobile', tone: 'primary' });
  expect(
    connectionStatusPresentation(
      { state: 'connecting', transport: 'cellular' },
      null,
    ),
  ).toEqual({ icon: 'refresh', key: 'networkConnectingMobile', tone: 'primary' });
});

test('distinguishes available internet from an AraChat realtime reconnect', () => {
  expect(
    connectionStatusPresentation(
      { state: 'connected', transport: 'cellular' },
      'connecting',
    ),
  ).toEqual({ icon: 'refresh', key: 'networkConnectingAraChat', tone: 'primary' });
  expect(
    connectionStatusPresentation(
      { state: 'connected', transport: 'cellular' },
      'disconnected',
    ),
  ).toEqual({ icon: 'refresh', key: 'networkRestoringAraChat', tone: 'primary' });
});
