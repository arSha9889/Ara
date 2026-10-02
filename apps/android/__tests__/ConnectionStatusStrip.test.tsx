import { act, create } from 'react-test-renderer';

import type { NetworkConnection } from '../src/features/network/networkClient';
import { ConnectionStatusStrip } from '../src/ui/ConnectionStatusStrip';

let mockConnection: NetworkConnection = { state: 'connected', transport: 'wifi' };
let mockRealtimeConnectionStatus: 'connected' | 'connecting' | 'disconnected' | null = 'connected';

jest.mock('../src/features/network/NetworkProvider', () => ({
  useNetwork: () => ({ connection: mockConnection }),
}));

jest.mock('../src/features/realtime/RealtimeProvider', () => ({
  useRealtimeConnectionStatus: () => mockRealtimeConnectionStatus,
}));

jest.mock('../src/localization/I18nProvider', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('../src/ui/Icon', () => ({
  Icon: 'Icon',
}));

describe('ConnectionStatusStrip', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockConnection = { state: 'connected', transport: 'wifi' };
    mockRealtimeConnectionStatus = 'connected';
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('waits before showing a transient reconnection state and hides it after recovery', async () => {
    let component: ReturnType<typeof create> | undefined;
    await act(async () => {
      component = create(<ConnectionStatusStrip />);
    });

    expect(component?.root.findAllByProps({ testID: 'network-status-strip' })).toHaveLength(0);

    mockConnection = { state: 'connected', transport: 'wifi' };
    mockRealtimeConnectionStatus = 'connecting';
    await act(async () => {
      component?.update(<ConnectionStatusStrip />);
    });

    await act(async () => {
      jest.advanceTimersByTime(1_499);
    });
    expect(component?.root.findAllByProps({ testID: 'network-status-strip' })).toHaveLength(0);

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(component?.root.findByProps({ testID: 'network-status-strip' })).toBeDefined();

    mockRealtimeConnectionStatus = 'disconnected';
    await act(async () => {
      component?.update(<ConnectionStatusStrip />);
    });
    expect(component?.root.findAllByProps({ testID: 'network-status-strip' })).not.toHaveLength(0);

    mockRealtimeConnectionStatus = 'connected';
    await act(async () => {
      component?.update(<ConnectionStatusStrip />);
    });
    expect(component?.root.findAllByProps({ testID: 'network-status-strip' })).toHaveLength(0);

    await act(async () => {
      component?.unmount();
    });
  });

  it('shows an offline state immediately', async () => {
    mockConnection = { state: 'disconnected', transport: 'none' };

    let component: ReturnType<typeof create> | undefined;
    await act(async () => {
      component = create(<ConnectionStatusStrip />);
    });

    expect(component?.root.findByProps({ testID: 'network-status-strip' })).toBeDefined();

    await act(async () => {
      component?.unmount();
    });
  });

  it('removes an offline state immediately while reconnecting', async () => {
    mockConnection = { state: 'disconnected', transport: 'none' };

    let component: ReturnType<typeof create> | undefined;
    await act(async () => {
      component = create(<ConnectionStatusStrip />);
    });
    expect(component?.root.findByProps({ testID: 'network-status-strip' })).toBeDefined();

    mockConnection = { state: 'connected', transport: 'wifi' };
    mockRealtimeConnectionStatus = 'connecting';
    await act(async () => {
      component?.update(<ConnectionStatusStrip />);
    });
    expect(component?.root.findAllByProps({ testID: 'network-status-strip' })).toHaveLength(0);

    await act(async () => {
      component?.unmount();
    });
  });
});
