import { act, create } from 'react-test-renderer';

const mockToggleVideo = jest.fn();
const mockSwitchCamera = jest.fn();
const mockCall = {
  callId: 'call-1',
  callType: 'video' as const,
  chatId: 'chat-1',
  connectedAt: Date.now(),
  failure: null,
  isCaller: true,
  isFrontCamera: true,
  isMuted: false,
  isVideoEnabled: true,
  localStream: { toURL: () => 'local-stream' },
  peerName: 'Peer',
  peerUserId: 'peer-1',
  phase: 'active' as const,
  remoteStream: { toURL: () => 'remote-stream' },
};
const mockDirectCall = {
  acceptCall: jest.fn().mockResolvedValue(undefined),
  audioRoutes: [],
  call: mockCall,
  dismissCall: jest.fn(),
  endCall: jest.fn(),
  rejectCall: jest.fn(),
  selectAudioRoute: jest.fn().mockResolvedValue(undefined),
  selectedAudioRouteId: null,
  switchCamera: () => mockSwitchCamera(),
  toggleMute: jest.fn(),
  toggleVideo: () => mockToggleVideo(),
};

jest.mock('react-native', () => ({
  BackHandler: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  Pressable: 'Pressable',
  SafeAreaView: 'SafeAreaView',
  StyleSheet: {
    create: <T extends object>(styles: T) => styles,
    hairlineWidth: 1,
  },
  Text: 'Text',
  View: 'View',
}));

jest.mock('react-native-webrtc', () => ({
  RTCView: 'RTCView',
}));

jest.mock('../src/features/calls/DirectCallProvider', () => ({
  useDirectCall: () => mockDirectCall,
}));

jest.mock('../src/features/calls/callForeground', () => ({
  subscribeToPictureInPicture: () => () => undefined,
}));

jest.mock('../src/localization/I18nProvider', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('../src/ui/ConnectionStatusStrip', () => ({
  ConnectionStatusStrip: 'ConnectionStatusStrip',
}));

jest.mock('../src/ui/Icon', () => ({
  Icon: 'Icon',
}));

import { CallOverlay } from '../src/features/calls/CallOverlay';

test('renders remote and local video in two RTC layers and exposes camera controls', async () => {
  jest.useFakeTimers();
  mockToggleVideo.mockReset();
  mockSwitchCamera.mockReset();

  let component!: ReturnType<typeof create>;
  await act(async () => {
    component = create(<CallOverlay />);
    await Promise.resolve();
  });
  const videoViews = component.root.findAllByType('RTCView' as never);

  expect(videoViews).toHaveLength(2);
  expect(videoViews[0].props).toMatchObject({ streamURL: 'remote-stream', zOrder: 0 });
  expect(videoViews[1].props).toMatchObject({ mirror: true, streamURL: 'local-stream', zOrder: 1 });

  act(() => {
    component.root.findByProps({ accessibilityLabel: 'callCameraOff' }).props.onPress();
    component.root.findByProps({ accessibilityLabel: 'callSwitchCamera' }).props.onPress();
  });

  expect(mockToggleVideo).toHaveBeenCalledTimes(1);
  expect(mockSwitchCamera).toHaveBeenCalledTimes(1);

  await act(async () => {
    component.unmount();
  });
  jest.useRealTimers();
});
