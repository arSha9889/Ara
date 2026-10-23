import { NativeModules } from 'react-native';

interface ClipboardModule {
  setText?(value: string): Promise<void>;
}

const clipboard = NativeModules.AraChatClipboard as ClipboardModule | undefined;

export async function copyTextToClipboard(value: string): Promise<void> {
  if (!clipboard?.setText) {
    throw new Error('Clipboard module is unavailable.');
  }

  await clipboard.setText(value);
}
