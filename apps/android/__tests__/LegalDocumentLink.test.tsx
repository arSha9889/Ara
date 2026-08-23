import { act, create } from 'react-test-renderer';
import { Linking } from 'react-native';

import { LegalDocumentLink } from '../src/features/auth/screens/LegalDocumentLink';

jest.mock('react-native', () => ({
  Linking: { openURL: jest.fn() },
  Pressable: 'Pressable',
  StyleSheet: { create: (styles: object) => styles },
  Text: 'Text',
}));

const mockOpenURL = Linking.openURL as jest.MockedFunction<typeof Linking.openURL>;

async function renderLegalDocumentLink(onOpenError: () => void, url: string) {
  let component: ReturnType<typeof create> | undefined;

  await act(async () => {
    component = create(
      <LegalDocumentLink label="Open Privacy Policy" onOpenError={onOpenError} url={url} />,
    );
  });

  return component!;
}

describe('LegalDocumentLink', () => {
  beforeEach(() => {
    mockOpenURL.mockReset();
  });

  it('opens the published document in the system browser', async () => {
    mockOpenURL.mockResolvedValue(undefined);
    const onOpenError = jest.fn();
    const url = 'https://aramsg.ru/privacy';
    const component = await renderLegalDocumentLink(onOpenError, url);

    await act(async () => {
      await component.root.findByProps({ testID: 'legal-document-link' }).props.onPress();
    });

    expect(mockOpenURL).toHaveBeenCalledWith(url);
    expect(onOpenError).not.toHaveBeenCalled();
  });

  it('shows the caller error when Android cannot open the document', async () => {
    mockOpenURL.mockRejectedValue(new Error('No browser available'));
    const onOpenError = jest.fn();
    const component = await renderLegalDocumentLink(onOpenError, 'https://aramsg.ru/privacy');

    await act(async () => {
      await component.root.findByProps({ testID: 'legal-document-link' }).props.onPress();
    });

    expect(onOpenError).toHaveBeenCalledTimes(1);
  });
});
