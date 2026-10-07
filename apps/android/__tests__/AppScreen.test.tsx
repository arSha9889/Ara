import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';

jest.mock('react-native', () => ({
  ScrollView: 'ScrollView',
  StyleSheet: {
    create: <T extends object>(styles: T) => styles,
  },
  Text: 'Text',
  View: 'View',
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
}));

jest.mock('../src/ui/ConnectionStatusStrip', () => ({
  ConnectionStatusStrip: 'ConnectionStatusStrip',
}));

import { AppScreen } from '../src/ui/AppScreen';

test('allows long scrollable forms to grow beyond the viewport', async () => {
  let component!: ReturnType<typeof create>;

  await act(async () => {
    component = create(
      <AppScreen>
        <Text>Long form</Text>
      </AppScreen>,
    );
  });

  const scrollView = component.root.findByType('ScrollView' as never);
  const scrollableContent = scrollView.props.children;

  expect(scrollableContent.props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ flexGrow: 1 })]),
  );
  expect(scrollableContent.props.style).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ flex: 1 })]),
  );

  await act(async () => {
    component.unmount();
  });
});
