import { act, create } from 'react-test-renderer';

jest.mock('react-native', () => ({
  Pressable: 'Pressable',
  StyleSheet: { create: <T extends object>(styles: T) => styles, hairlineWidth: 1 },
  Text: 'Text',
  View: 'View',
}));

jest.mock('../src/localization/I18nProvider', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('../src/ui/Icon', () => ({
  Icon: 'Icon',
}));

jest.mock('../src/features/auth/screens/LegalDocumentLink', () => ({
  LegalDocumentLink: 'LegalDocumentLink',
}));

import { LegalDocumentsConsent } from '../src/features/auth/components/LegalDocumentsConsent';

test('shows both published documents and tracks each consent independently', async () => {
  let acceptedPrivacy = false;
  let acceptedTerms = false;
  let component!: ReturnType<typeof create>;
  const onOpenError = jest.fn();

  function render(): void {
    component.update(
      <LegalDocumentsConsent
        acceptedPrivacy={acceptedPrivacy}
        acceptedTerms={acceptedTerms}
        onAcceptedPrivacyChange={() => {
          acceptedPrivacy = !acceptedPrivacy;
          render();
        }}
        onAcceptedTermsChange={() => {
          acceptedTerms = !acceptedTerms;
          render();
        }}
        onOpenError={onOpenError}
      />,
    );
  }

  await act(async () => {
    component = create(
      <LegalDocumentsConsent
        acceptedPrivacy={acceptedPrivacy}
        acceptedTerms={acceptedTerms}
        onAcceptedPrivacyChange={() => undefined}
        onAcceptedTermsChange={() => undefined}
        onOpenError={onOpenError}
      />,
    );
    render();
  });

  const links = component.root.findAllByType('LegalDocumentLink' as never);
  expect(links).toHaveLength(2);
  expect(links[0].props).toMatchObject({
    label: 'openPrivacyPolicy',
    url: 'https://aramsg.ru/privacy',
  });
  expect(links[1].props).toMatchObject({
    label: 'openTermsOfUse',
    url: 'https://aramsg.ru/terms',
  });

  await act(async () => {
    component.root.findAllByProps({ accessibilityRole: 'checkbox' })[0].props.onPress();
  });

  expect(component.root.findAllByProps({ accessibilityRole: 'checkbox' })[0].props.accessibilityState).toEqual({ checked: true });
  expect(component.root.findAllByProps({ accessibilityRole: 'checkbox' })[1].props.accessibilityState).toEqual({ checked: false });

  await act(async () => {
    component.root.findAllByProps({ accessibilityRole: 'checkbox' })[1].props.onPress();
  });

  expect(component.root.findAllByProps({ accessibilityRole: 'checkbox' })[1].props.accessibilityState).toEqual({ checked: true });

  await act(async () => {
    component.unmount();
  });
});
