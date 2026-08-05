export const REGIONS = [
  { id: 'RU', flag: '🇷🇺', languages: ['ru'] },
  { id: 'KZ', flag: '🇰🇿', languages: ['kk', 'ru'] },
  { id: 'KG', flag: '🇰🇬', languages: ['ky', 'ru'] },
  { id: 'UA', flag: '🇺🇦', languages: ['uk', 'ru'] },
  { id: 'BY', flag: '🇧🇾', languages: ['be', 'ru'] },
  { id: 'UZ', flag: '🇺🇿', languages: ['uz', 'ru'] },
  { id: 'GLOBAL', flag: '🌍', languages: ['en'] },
];

export function getRegion(regionId) {
  return REGIONS.find((region) => region.id === regionId) ?? REGIONS[0];
}
