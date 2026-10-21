function currentLocale() {
  return document.documentElement.lang || 'ru';
}

export function formatFileSize(value) {
  if (!Number.isFinite(value) || value < 1) return '';

  const isMegabytes = value >= 1024 * 1024;
  const amount = isMegabytes ? value / (1024 * 1024) : Math.ceil(value / 1024);
  const maximumFractionDigits = isMegabytes && amount < 10 ? 1 : 0;

  return new Intl.NumberFormat(currentLocale(), {
    style: 'unit',
    unit: isMegabytes ? 'megabyte' : 'kilobyte',
    unitDisplay: 'short',
    maximumFractionDigits,
  }).format(amount);
}
