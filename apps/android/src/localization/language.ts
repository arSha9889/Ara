export const supportedLanguages = ['ru', 'en'] as const;

export type AppLanguage = (typeof supportedLanguages)[number];

export function isAppLanguage(value: unknown): value is AppLanguage {
  return typeof value === 'string' && supportedLanguages.includes(value as AppLanguage);
}

export function systemLanguage(value: unknown): AppLanguage {
  if (typeof value !== 'string') {
    return 'ru';
  }

  return value.trim().toLowerCase().startsWith('en') ? 'en' : 'ru';
}
