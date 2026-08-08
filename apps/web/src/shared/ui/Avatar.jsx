import { API_BASE_URL } from '../api/httpClient.js';

export const BUILT_IN_AVATARS = Array.from({ length: 20 }, (_, index) => `animal-${String(index + 1).padStart(2, '0')}`);

export const AVATAR_EMOJIS = [
  '🦊', '🐼', '🐯', '🦁', '🐨', '🐸', '🐵', '🐧', '🦉', '🐺',
  '🐰', '🦄', '🐙', '🐢', '🦋', '🐝', '🦕', '🐬', '🦭', '🐿️',
];

export function avatarEmoji(avatarRef) {
  const index = BUILT_IN_AVATARS.indexOf(avatarRef || 'animal-01');
  return AVATAR_EMOJIS[index >= 0 ? index : 0];
}

function isLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function avatarImageUrl(avatarRef, previewUrl = '') {
  const source = previewUrl || avatarRef || '';
  if (!source) return '';
  if (source.startsWith('/')) return `${API_BASE_URL}${source}`;

  try {
    const url = new URL(source);
    if (typeof window !== 'undefined' && isLocalHost(url.hostname) && !isLocalHost(window.location.hostname)) {
      return `${API_BASE_URL}${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    return '';
  }
  return source;
}

export function UserAvatar({
  profile,
  previewUrl = '',
  fallback = 'N',
  baseClass = 'avatar',
  className = '',
  size = '',
  decorative = true,
  alt = '',
}) {
  const imageUrl = avatarImageUrl(profile?.avatar_type === 'uploaded' ? profile.avatar_ref : '', previewUrl);
  const classes = [baseClass, size, imageUrl ? 'avatar-image' : 'avatar-emoji', className].filter(Boolean).join(' ');
  const accessibleProps = decorative ? { alt: '', 'aria-hidden': 'true' } : { alt };

  if (imageUrl) {
    return (
      <img
        className={classes}
        src={imageUrl}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        {...accessibleProps}
      />
    );
  }

  return (
    <div className={classes} aria-hidden={decorative ? 'true' : undefined} role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : alt}>
      {profile?.avatar_type === 'built_in' ? avatarEmoji(profile.avatar_ref) : fallback}
    </div>
  );
}
