import { act, create } from 'react-test-renderer';

const mockConfirmEmailVerification = jest.fn();
const mockCompleteRegistration = jest.fn();
const mockStartEmailVerification = jest.fn();
const mockGetDeviceId = jest.fn();
const mockMarkNotificationPermissionRequest = jest.fn();
const mockSaveSession = jest.fn();

jest.mock('react-native', () => ({
  Pressable: 'Pressable',
  StyleSheet: { create: <T extends object>(styles: T) => styles, hairlineWidth: 1 },
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
}));

jest.mock('../src/config/runtimeConfig', () => ({
  runtimeConfig: { apiBaseUrl: 'https://api.aramsg.ru' },
}));

jest.mock('../src/infrastructure/storage/sessionStore', () => ({
  sessionStore: {
    getDeviceId: (...args: unknown[]) => mockGetDeviceId(...args),
    markNotificationPermissionRequest: (...args: unknown[]) =>
      mockMarkNotificationPermissionRequest(...args),
  },
}));

jest.mock('../src/localization/I18nProvider', () => ({
  useI18n: () => ({ language: 'ru', t: (key: string) => key }),
}));

jest.mock('../src/features/auth/api/authApi', () => ({
  completeRegistration: (...args: unknown[]) => mockCompleteRegistration(...args),
  confirmEmailVerification: (...args: unknown[]) => mockConfirmEmailVerification(...args),
  startEmailVerification: (...args: unknown[]) => mockStartEmailVerification(...args),
}));

jest.mock('../src/features/auth/session/useSession', () => ({
  useSession: () => ({ saveSession: (...args: unknown[]) => mockSaveSession(...args) }),
}));

jest.mock('../src/features/auth/screens/AuthLayout', () => ({
  AuthLayout: 'AuthLayout',
  useAuthStyles: () => ({
    configurationMessage: {},
    error: {},
    label: {},
    link: {},
    linkLabel: {},
    secondaryAction: {},
    secondaryActionLabel: {},
    success: {},
  }),
}));

jest.mock('../src/features/auth/components/LegalDocumentsConsent', () => ({
  LegalDocumentsConsent: 'LegalDocumentsConsent',
}));

jest.mock('../src/ui/PrimaryButton', () => ({
  PrimaryButton: 'PrimaryButton',
}));

import { RegisterScreen } from '../src/features/auth/screens/RegisterScreen';

function primaryButton(component: ReturnType<typeof create>, label: string) {
  const button = component.root
    .findAllByType('PrimaryButton' as never)
    .find(item => item.props.label === label);

  if (!button) {
    throw new Error(`Primary button ${label} was not found.`);
  }

  return button;
}

function textInput(component: ReturnType<typeof create>, accessibilityLabel: string) {
  return component.root.findByProps({ accessibilityLabel });
}

test('shows a dedicated legal step before the registration request', async () => {
  mockStartEmailVerification.mockResolvedValue({ verification_id: 'verification-1' });
  mockConfirmEmailVerification.mockResolvedValue({ email: 'name@example.com' });
  mockCompleteRegistration.mockResolvedValue({ user: { id: 'user-1' } });
  mockGetDeviceId.mockResolvedValue('android-device-1');
  mockMarkNotificationPermissionRequest.mockResolvedValue(undefined);
  mockSaveSession.mockResolvedValue(undefined);

  let component!: ReturnType<typeof create>;
  await act(async () => {
    component = create(<RegisterScreen country="RU" onBack={jest.fn()} />);
  });

  await act(async () => {
    textInput(component, 'email').props.onChangeText('name@example.com');
  });
  await act(async () => {
    await component.root
      .findAllByProps({ accessibilityRole: 'button' })[0]
      .props.onPress();
  });

  await act(async () => {
    textInput(component, 'verificationCode').props.onChangeText('123456');
  });
  await act(async () => {
    await primaryButton(component, 'confirmEmail').props.onPress();
  });

  await act(async () => {
    textInput(component, 'displayName').props.onChangeText('Ara Chat');
    textInput(component, 'username').props.onChangeText('arachat');
    textInput(component, 'password').props.onChangeText('password123');
    textInput(component, 'repeatPassword').props.onChangeText('password123');
  });
  await act(async () => {
    primaryButton(component, 'continue').props.onPress();
  });

  const legalStep = component.root.findByType('LegalDocumentsConsent' as never);
  expect(legalStep.props).toMatchObject({ acceptedPrivacy: false, acceptedTerms: false });
  expect(component.root.findByType('AuthLayout' as never).props.title).toBe('legalTitle');
  expect(mockCompleteRegistration).not.toHaveBeenCalled();

  await act(async () => {
    legalStep.props.onAcceptedPrivacyChange();
    legalStep.props.onAcceptedTermsChange();
  });
  await act(async () => {
    await primaryButton(component, 'createAccountAction').props.onPress();
  });

  expect(mockCompleteRegistration).toHaveBeenCalledWith({
    country: 'RU',
    deviceId: 'android-device-1',
    displayName: 'Ara Chat',
    emailVerificationId: 'verification-1',
    language: 'ru',
    password: 'password123',
    username: 'arachat',
  });
  expect(mockSaveSession).toHaveBeenCalledTimes(1);

  await act(async () => {
    component.unmount();
  });
});
