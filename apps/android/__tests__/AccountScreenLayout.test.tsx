import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';

jest.mock('react-native', () => ({
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Platform: {
    select: (options: Record<string, unknown>) => options.android ?? options.default,
  },
  StyleSheet: {
    create: <T extends object>(styles: T) => styles,
    hairlineWidth: 1,
  },
  Text: 'Text',
  View: 'View',
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn() }),
}));

jest.mock('../src/localization/I18nProvider', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('../src/ui/AppScreen', () => ({
  AppScreen: 'AppScreen',
}));

jest.mock('../src/ui/IconButton', () => ({
  IconButton: 'IconButton',
}));

import { AccountScreenLayout } from '../src/features/account/components/AccountScreenLayout';
import { colors } from '../src/theme/theme';

test('keeps account forms above the Android keyboard and includes the bottom safe area', async () => {
  let component!: ReturnType<typeof create>;
  await act(async () => {
    component = create(
      <AccountScreenLayout description="description" title="title">
        <Text>form</Text>
      </AccountScreenLayout>,
    );
  });

  const keyboardAvoidingView = component.root.findByType('KeyboardAvoidingView' as never);
  expect(keyboardAvoidingView.props.behavior).toBe('height');
  expect(keyboardAvoidingView.props.style).toMatchObject({
    backgroundColor: colors.canvas,
    flex: 1,
  });
  expect(component.root.findByType('AppScreen' as never).props.bottomSafeArea).toBe(true);

  await act(async () => {
    component.unmount();
  });
});
