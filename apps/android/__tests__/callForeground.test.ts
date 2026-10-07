jest.mock('react-native', () => ({
  NativeEventEmitter: jest.fn(() => ({ addListener: jest.fn() })),
  NativeModules: {},
}));

import { parsePictureInPictureEvent } from '../src/features/calls/callForeground';

test('accepts only the native PiP presentation event contract', () => {
  expect(parsePictureInPictureEvent({ isInPictureInPicture: true })).toEqual({
    isInPictureInPicture: true,
  });
  expect(parsePictureInPictureEvent({ isInPictureInPicture: 'true' })).toBeNull();
  expect(parsePictureInPictureEvent(null)).toBeNull();
});
