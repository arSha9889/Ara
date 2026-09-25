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
    href: 'https://www.youtube.com/@AAL32963',
    icon: 'youtube',
  },
  {
    key: 'max',
    title: 'MAX',
    href: 'https://max.ru/join/rDRQgG4mKaj9KUrnPugtIZydr4B5llT5hQNTpKqO0gE',
    asset: '/icons/social/max.png',
  },
];

export const YOUTUBE_CHANNEL_URL = OFFICIAL_CHANNELS.find((channel) => channel.key === 'youtube')?.href ?? '';

export const DONATION_DETAILS = {
  phone: '+79320998551',
  phoneDisplay: '+7 932 099-85-51',
  recipient: 'Артём Антонов',
  banks: ['Т‑Банк', 'Сбер', 'ВТБ'],
};
