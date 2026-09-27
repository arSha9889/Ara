export const registrationCountryOptions = [
  { code: 'RU', labelKey: 'registrationCountryRussia' },
  { code: 'KZ', labelKey: 'registrationCountryKazakhstan' },
  { code: 'KG', labelKey: 'registrationCountryKyrgyzstan' },
  { code: 'BY', labelKey: 'registrationCountryBelarus' },
  { code: 'UZ', labelKey: 'registrationCountryUzbekistan' },
  { code: 'UA', labelKey: 'registrationCountryUkraine' },
] as const;

export type RegistrationCountry = (typeof registrationCountryOptions)[number]['code'];
