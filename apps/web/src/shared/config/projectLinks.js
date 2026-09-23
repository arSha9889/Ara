export const OFFICIAL_CHANNELS = [
  {
    key: 'telegram',
    title: 'Telegram',
    href: 'https://t.me/aramessage',
    asset: '/icons/social/telegram.svg',
  },
  {
    key: 'vk',
    title: 'VK',
    href: 'https://vk.ru/club241439239',
    asset: '/icons/social/vk.svg',
  },
  {
    key: 'youtube',
    title: 'YouTube',
    href: '',
    icon: 'youtube',
  },
  {
    key: 'max',
    title: 'MAX',
    href: '',
    asset: '/icons/social/max.png',
  },
];

export const YOUTUBE_CHANNEL_URL = OFFICIAL_CHANNELS.find((channel) => channel.key === 'youtube')?.href ?? '';
