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

export const APP_DISTRIBUTION = [
  {
    key: 'android',
    icon: 'smartphone',
    labelKey: 'onboarding.downloadPlatformAndroid',
    descriptionKey: 'onboarding.downloadPlatformAndroidText',
    requirementKey: 'onboarding.downloadAndroidRequirement',
    groups: [
      {
        key: 'android-app',
        icon: 'smartphone',
        titleKey: 'onboarding.downloadAndroidGroupTitle',
        descriptionKey: 'onboarding.downloadAndroidGroupText',
        channels: [
          {
            key: 'rustore',
            icon: 'smartphone',
            labelKey: 'onboarding.downloadRustore',
            descriptionKey: 'onboarding.downloadRustoreText',
            href: '',
          },
          {
            key: 'apk',
            icon: 'shield',
            labelKey: 'onboarding.downloadApk',
            descriptionKey: 'onboarding.downloadApkText',
            href: 'https://aramsg.ru/downloads/arachat-1.0.apk',
          },
        ],
      },
    ],
  },
  {
    key: 'apple',
    icon: 'tablet',
    labelKey: 'onboarding.downloadPlatformApple',
    descriptionKey: 'onboarding.downloadPlatformAppleText',
    groups: [
      {
        key: 'iphone-ipad',
        icon: 'smartphone',
        titleKey: 'onboarding.downloadIphoneGroupTitle',
        descriptionKey: 'onboarding.downloadIphoneGroupText',
        channels: [
          {
            key: 'app-store',
            icon: 'smartphone',
            labelKey: 'onboarding.downloadAppStore',
            descriptionKey: 'onboarding.downloadAppStoreText',
            href: '',
          },
          {
            key: 'testflight',
            icon: 'sparkles',
            labelKey: 'onboarding.downloadTestFlight',
            descriptionKey: 'onboarding.downloadTestFlightText',
            href: '',
          },
        ],
      },
      {
        key: 'mac',
        icon: 'monitor',
        titleKey: 'onboarding.downloadMacGroupTitle',
        descriptionKey: 'onboarding.downloadMacGroupText',
        channels: [
          {
            key: 'mac-app-store',
            icon: 'monitor',
            labelKey: 'onboarding.downloadMacAppStore',
            descriptionKey: 'onboarding.downloadMacAppStoreText',
            href: '',
          },
          {
            key: 'dmg',
            icon: 'shield',
            labelKey: 'onboarding.downloadDmg',
            descriptionKey: 'onboarding.downloadDmgText',
            href: '',
          },
        ],
      },
    ],
  },
  {
    key: 'windows',
    icon: 'monitor',
    labelKey: 'onboarding.downloadPlatformWindows',
    descriptionKey: 'onboarding.downloadPlatformWindowsText',
    groups: [
      {
        key: 'windows',
        icon: 'monitor',
        titleKey: 'onboarding.downloadWindowsGroupTitle',
        descriptionKey: 'onboarding.downloadWindowsGroupText',
        channels: [
          {
            key: 'windows-installer',
            icon: 'monitor',
            labelKey: 'onboarding.downloadWindowsInstaller',
            descriptionKey: 'onboarding.downloadWindowsInstallerText',
            href: '',
          },
        ],
      },
    ],
  },
];

export const DONATION_DETAILS = {
  phone: '+79320998551',
  phoneDisplay: '+7 932 099-85-51',
  recipient: 'Артём Антонов',
  banks: ['Т‑Банк', 'Сбер', 'ВТБ'],
};
