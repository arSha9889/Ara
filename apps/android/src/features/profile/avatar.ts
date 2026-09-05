export const builtInAvatarRefs = [
  'animal-01',
  'animal-02',
  'animal-03',
  'animal-04',
  'animal-05',
  'animal-06',
  'animal-07',
  'animal-08',
  'animal-09',
  'animal-10',
  'animal-11',
  'animal-12',
  'animal-13',
  'animal-14',
  'animal-15',
  'animal-16',
  'animal-17',
  'animal-18',
  'animal-19',
  'animal-20',
] as const;

export type BuiltInAvatarRef = (typeof builtInAvatarRefs)[number];

const avatarEmojis: Record<BuiltInAvatarRef, string> = {
  'animal-01': '🦊',
  'animal-02': '🐼',
  'animal-03': '🐯',
  'animal-04': '🦁',
  'animal-05': '🐨',
  'animal-06': '🐸',
  'animal-07': '🐵',
  'animal-08': '🐧',
  'animal-09': '🦉',
  'animal-10': '🐺',
  'animal-11': '🐰',
  'animal-12': '🦄',
  'animal-13': '🐙',
  'animal-14': '🐢',
  'animal-15': '🦋',
  'animal-16': '🐝',
  'animal-17': '🦕',
  'animal-18': '🐬',
  'animal-19': '🦭',
  'animal-20': '🐿️',
};

export function avatarEmoji(avatarRef?: string): string | null {
  return avatarRef && avatarRef in avatarEmojis
    ? avatarEmojis[avatarRef as BuiltInAvatarRef]
    : null;
}
