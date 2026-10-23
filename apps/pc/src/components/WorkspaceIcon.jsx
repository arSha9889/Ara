import callsIcon from '../assets/button-icons/calls.png';
import bellIcon from '../assets/button-icons/bell.png';
import chatsIcon from '../assets/button-icons/chats.png';
import channelsIcon from '../assets/button-icons/channels.png';
import contactsIcon from '../assets/button-icons/contacts.png';
import micIcon from '../assets/button-icons/mic.png';
import profileIcon from '../assets/button-icons/profile.png';
import settingsIcon from '../assets/button-icons/settings.png';
import speakerIcon from '../assets/button-icons/speaker.png';
import videoIcon from '../assets/button-icons/video.png';

const BUTTON_ICON_ASSETS = {
  bell: bellIcon,
  calls: callsIcon,
  camera: videoIcon,
  chats: chatsIcon,
  channels: channelsIcon,
  contacts: contactsIcon,
  mic: micIcon,
  profile: profileIcon,
  settings: settingsIcon,
  speaker: speakerIcon,
  video: videoIcon,
};

export function WorkspaceIcon({ name, size = 20 }) {
  const asset = BUTTON_ICON_ASSETS[name];
  if (asset) {
    return <span aria-hidden="true" className="workspace-icon-asset" style={{ '--workspace-icon-mask': `url(${asset})`, width: size, height: size }} />;
  }

  const commonProps = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.8',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };

  if (name === 'channels') return <svg {...commonProps}><path d="M4 12.2V9.8l11-4.3v11L4 12.2Z" /><path d="M15 8.2c2.3.7 3.7 2 3.7 3.8S17.3 15.1 15 15.8M6.4 13.2l1.3 5.1h3.1l-1-4" /><path d="M20.2 8.3c1.2 1 1.8 2.2 1.8 3.7s-.6 2.7-1.8 3.7" /></svg>;
  if (name === 'groups') return <svg {...commonProps}><circle cx="9" cy="8.2" r="3" /><circle cx="16.8" cy="9.5" r="2.3" /><path d="M3.6 19.5c.8-3.2 2.8-4.8 5.4-4.8s4.6 1.6 5.4 4.8" /><path d="M14.4 15.5c2.7-.2 4.7 1.1 5.3 4" /></svg>;
  if (name === 'settings') return <svg {...commonProps}><circle cx="12" cy="12" r="2.8" /><path d="M19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1-2.2 2.2-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-3.2v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-2.2-2.2.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1h-.2V9.3h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1L8.5 4l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h3.2v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 2.2 2.2-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v3.2h-.2a1.7 1.7 0 0 0-1.6 1Z" /></svg>;
  if (name === 'search') return <svg {...commonProps}><circle cx="10.7" cy="10.7" r="5.7" /><path d="m15 15 4.2 4.2" /></svg>;
  if (name === 'plus') return <svg {...commonProps}><path d="M12 5v14M5 12h14" /></svg>;
  if (name === 'close') return <svg {...commonProps}><path d="m6 6 12 12M18 6 6 18" /></svg>;
  if (name === 'arrow-left') return <svg {...commonProps}><path d="m14.5 5-7 7 7 7M8 12h10" /></svg>;
  if (name === 'edit') return <svg {...commonProps}><path d="m5 19 3.4-.7L19 7.7a2.1 2.1 0 0 0-3-3L5.4 15.3 5 19Z" /><path d="m14.6 6.1 3.3 3.3" /></svg>;
  if (name === 'save') return <svg {...commonProps}><path d="M5 3h11l3 3v15H5V3Z" /><path d="M8 3v6h8V3M8 21v-7h8v7" /></svg>;
  if (name === 'mic-off') return <svg {...commonProps}><path d="m4 4 16 16" /><path d="M9 9v2a3 3 0 0 0 4.9 2.3M15 9V7a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 11.7 5.2M12 18v3M8.5 21h7" /></svg>;
  if (name === 'bell') return <svg {...commonProps}><path d="M18 10a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 22h4" /></svg>;
  if (name === 'palette') return <svg {...commonProps}><path d="M12 3a9 9 0 0 0 0 18h1.1a1.9 1.9 0 0 0 1.6-2.9 1.9 1.9 0 0 1 1.6-2.9h1.2A3.5 3.5 0 0 0 21 11.7C20.8 6.8 16.8 3 12 3Z" /><circle cx="7.5" cy="11" r=".7" fill="currentColor" /><circle cx="10" cy="7.7" r=".7" fill="currentColor" /><circle cx="14" cy="7.7" r=".7" fill="currentColor" /></svg>;
  if (name === 'shield') return <svg {...commonProps}><path d="M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3Z" /><path d="m8.7 12 2.1 2.1 4.6-4.6" /></svg>;
  if (name === 'eye') return <svg {...commonProps}><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></svg>;
  if (name === 'chevron-right') return <svg {...commonProps}><path d="m9 5 7 7-7 7" /></svg>;
  if (name === 'check') return <svg {...commonProps}><path d="m5 12.5 4.3 4.3L19.5 6.6" /></svg>;
  if (name === 'check-double') return <svg {...commonProps}><path d="m2.8 12.4 3.8 3.8 6.2-7M9.5 12.4l3.8 3.8 7.1-8.1" /></svg>;
  if (name === 'attachment') return <svg {...commonProps}><path d="m20 11.4-7.7 7.7a5 5 0 0 1-7.1-7.1l8.2-8.2a3.4 3.4 0 1 1 4.8 4.8L10 16.8a1.8 1.8 0 0 1-2.5-2.5l7.4-7.4" /></svg>;
  if (name === 'link') return <svg {...commonProps}><path d="M10.2 13.8a4.1 4.1 0 0 0 5.8 0l2.7-2.7a4.1 4.1 0 0 0-5.8-5.8L11.3 7" /><path d="M13.8 10.2a4.1 4.1 0 0 0-5.8 0l-2.7 2.7a4.1 4.1 0 0 0 5.8 5.8l1.6-1.6" /></svg>;
  if (name === 'send') return <svg {...commonProps}><path d="m21 3-7.7 18-3.1-7-7.2-3L21 3Z" /><path d="m10.2 14 4.2-4.2" /></svg>;
  if (name === 'refresh') return <svg {...commonProps}><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M6.1 9a7 7 0 0 1 11.8-2L20 9M4 15l2.1 2a7 7 0 0 0 11.8-2" /></svg>;
  if (name === 'image') return <svg {...commonProps}><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="8.5" cy="9" r="1.6" /><path d="m4.5 18 5.2-5.1 3.6 3 2.2-2 4 4.1" /></svg>;
  if (name === 'document') return <svg {...commonProps}><path d="M6 3h8l4 4v14H6V3Z" /><path d="M14 3v5h5M9 13h6M9 16.5h4.5" /></svg>;
  if (name === 'play') return <svg {...commonProps}><path d="m9 7 8 5-8 5V7Z" /></svg>;
  if (name === 'phone-outgoing') return <svg {...commonProps}><path d="M7.8 4.3 10.4 8 8.9 9.8a12.7 12.7 0 0 0 5.3 5.3l1.8-1.5 3.7 2.6-1 3.1a2.5 2.5 0 0 1-2.8 1.6C9.5 19.7 4.3 14.5 3.1 8.1a2.5 2.5 0 0 1 1.6-2.8l3.1-1Z" /><path d="M14 5h5v5M19 5l-6.2 6.2" /></svg>;
  if (name === 'phone-incoming') return <svg {...commonProps}><path d="M7.8 4.3 10.4 8 8.9 9.8a12.7 12.7 0 0 0 5.3 5.3l1.8-1.5 3.7 2.6-1 3.1a2.5 2.5 0 0 1-2.8 1.6C9.5 19.7 4.3 14.5 3.1 8.1a2.5 2.5 0 0 1 1.6-2.8l3.1-1Z" /><path d="M14 10h5V5M19 5l-6.2 6.2" /></svg>;
  if (name === 'phone-off') return <svg {...commonProps}><path d="m4 4 16 16" /><path d="m10.4 8.7-1.5 1.1a12.7 12.7 0 0 0 5.3 5.3l1.8-1.5 3.7 2.6-1 3.1a2.5 2.5 0 0 1-2.8 1.6 16.8 16.8 0 0 1-10.8-10.8 2.5 2.5 0 0 1 1.6-2.8l3.1-1 1.6 2.2" /></svg>;
  if (name === 'speaker-off') return <svg {...commonProps}><path d="M4 10h4l5-4v12l-5-4H4v-4Z" /><path d="m17 9 4 4M21 9l-4 4" /></svg>;
  if (name === 'screen') return <svg {...commonProps}><rect x="3" y="4" width="18" height="13" rx="2.4" /><path d="M8 21h8M12 17v4" /></svg>;
  if (name === 'pause') return <svg {...commonProps}><path d="M8 5v14M16 5v14" /></svg>;
  if (name === 'switch') return <svg {...commonProps}><path d="M7 7h10l-3-3M17 17H7l3 3M17 7l3 3M7 17l-3-3" /></svg>;
  if (name === 'warning') return <svg {...commonProps}><path d="M12 3 2.9 19a1.4 1.4 0 0 0 1.2 2h15.8a1.4 1.4 0 0 0 1.2-2L12 3Z" /><path d="M12 9v4.5M12 17.1v.1" /></svg>;
  if (name === 'key') return <svg {...commonProps}><circle cx="7.5" cy="15.5" r="3.5" /><path d="m10.1 12.9 7.8-7.8 2 2-1.5 1.5 1.2 1.2-1.8 1.8-1.2-1.2-4 4" /></svg>;
  if (name === 'lock') return <svg {...commonProps}><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7.2a4 4 0 0 1 8 0V10M12 14.5v2.5" /></svg>;
  if (name === 'mail') return <svg {...commonProps}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></svg>;
  if (name === 'info') return <svg {...commonProps}><circle cx="12" cy="12" r="8.5" /><path d="M12 10.5v5M12 7.8v.1" /></svg>;
  if (name === 'device') return <svg {...commonProps}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 18h6M10.5 6h3" /></svg>;
  if (name === 'logout') return <svg {...commonProps}><path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9" /></svg>;
  if (name === 'pin') return <svg {...commonProps}><path d="m15.5 4 4.5 4.5-3 1.1-2.9 4.9-2.6-2.6-4.9 2.9L5.5 12l4.9-2.9L11.5 6 15.5 4Z" /><path d="m11.5 14.5-6 6" /></svg>;
  if (name === 'reply') return <svg {...commonProps}><path d="m9 8-5 4 5 4" /><path d="M5 12h8.5a6.5 6.5 0 0 1 6.5 6.5" /></svg>;
  if (name === 'smile') return <svg {...commonProps}><circle cx="12" cy="12" r="8.5" /><path d="M8.5 14.2c1 1.5 2.1 2.2 3.5 2.2s2.5-.7 3.5-2.2M9 9.5h.1M15 9.5h.1" /></svg>;
  if (name === 'trash') return <svg {...commonProps}><path d="M4 7h16M9 7V4h6v3M7 7l.8 13h8.4L17 7M10 11v5M14 11v5" /></svg>;
  return null;
}
