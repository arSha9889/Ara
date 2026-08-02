const ICON_PATHS = {
  chat: <><path d="M20 15.5a3 3 0 0 1-3 3H9l-5 3v-3.8a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3Z" /><path d="M7.5 10.5h.01M12 10.5h.01M16.5 10.5h.01" /></>,
  branches: <><path d="M5 5.5h14v13H5z" /><path d="M8 9h8M8 12h8M8 15h4" /><path d="M18 3v5M15.5 5.5h5" /></>,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M4.5 20c.8-3.5 3.4-5.5 7.5-5.5s6.7 2 7.5 5.5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06-2.2 2.2-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56v.1h-3.12v-.1a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06-2.2-2.2.06-.06A1.7 1.7 0 0 0 6.74 15a1.7 1.7 0 0 0-1.56-1.04h-.1v-3.12h.1A1.7 1.7 0 0 0 6.74 9.8a1.7 1.7 0 0 0-.34-1.87l-.06-.06 2.2-2.2.06.06a1.7 1.7 0 0 0 1.87.34 1.7 1.7 0 0 0 1.04-1.56v-.1h3.12v.1a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06 2.2 2.2-.06.06a1.7 1.7 0 0 0-.34 1.87 1.7 1.7 0 0 0 1.56 1.04h.1v3.12h-.1A1.7 1.7 0 0 0 19.4 15Z" /></>,
  logout: <><path d="M10 5H5v14h5" /><path d="M14 8l4 4-4 4M18 12H9" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <><circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 4 4" /></>,
  arrowLeft: <path d="M19 12H5m7-7-7 7 7 7" />,
  arrowRight: <path d="M5 12h14m-7-7 7 7-7 7" />,
  chevronRight: <path d="m9 5 7 7-7 7" />,
  activity: <><path d="M3 12h4l2.2-6 4 12 2.2-6H21" /></>,
  paperclip: <path d="m8.5 12.8 5.85-5.85a3 3 0 1 1 4.24 4.24l-7.62 7.62a5 5 0 0 1-7.07-7.07l7.43-7.43" />,
  smile: <><circle cx="12" cy="12" r="8" /><path d="M8.5 14.5s1.1 1.5 3.5 1.5 3.5-1.5 3.5-1.5M9 9.5h.01M15 9.5h.01" /></>,
  microphone: <><rect x="9" y="4" width="6" height="11" rx="3" /><path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v3M9 20h6" /></>,
  microphoneOff: <><rect x="9" y="4" width="6" height="11" rx="3" /><path d="M6.5 11.5a5.5 5.5 0 0 0 8.2 4.8M12 17v3M9 20h6M4 4l16 16" /></>,
  video: <><rect x="3.5" y="6" width="12" height="12" rx="2" /><path d="m15.5 10 5-3v10l-5-3" /></>,
  phone: <path d="M8.2 4.5 6.4 6.3c-.6.6-.8 1.5-.4 2.2 2 4.3 4.9 7.2 9.2 9.2.7.3 1.6.2 2.2-.4l1.8-1.8-3.2-3.2-1.8 1.1a12.4 12.4 0 0 1-3.6-3.6l1.1-1.8-3.5-3.5Z" />,
  phoneOff: <><path d="M8.2 4.5 6.4 6.3c-.6.6-.8 1.5-.4 2.2 2 4.3 4.9 7.2 9.2 9.2.7.3 1.6.2 2.2-.4l1.8-1.8-3.2-3.2-1.8 1.1a12.4 12.4 0 0 1-3.6-3.6l1.1-1.8-3.5-3.5Z" /><path d="m4 4 16 16" /></>,
  monitor: <><rect x="3.5" y="4.5" width="17" height="12" rx="2" /><path d="M8.5 20h7M12 16.5V20" /></>,
  tablet: <><rect x="6.5" y="3" width="11" height="18" rx="2" /><path d="M11 18h2" /></>,
  smartphone: <><rect x="7.5" y="2.5" width="9" height="19" rx="2" /><path d="M11 18.5h2" /></>,
  layoutAuto: <><rect x="3.5" y="4" width="17" height="12.5" rx="2" /><path d="M8.5 20h7M12 16.5V20M7.5 8h9M7.5 11h5" /><path d="m16.5 7.5 1.5 1.5-1.5 1.5" /></>,
  palette: <><path d="M12 3a9 9 0 1 0 0 18h1.2a1.8 1.8 0 0 0 1.6-2.63l-.25-.5a1.8 1.8 0 0 1 1.6-2.62H17A4 4 0 0 0 21 11.3C20.5 6.5 16.7 3 12 3Z" /><path d="M7.5 11h.01M9.5 7.5h.01M14.5 7.5h.01M17 11h.01" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.3 2.5 3.5 5.5 3.5 9s-1.2 6.5-3.5 9c-2.3-2.5-3.5-5.5-3.5-9S9.7 5.5 12 3Z" /></>,
  shield: <><path d="M12 3.5 19 6v5.2c0 4.5-2.7 7.6-7 9.3-4.3-1.7-7-4.8-7-9.3V6l7-2.5Z" /><path d="m9 12 2 2 4-4" /></>,
  copy: <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  check: <path d="m5 12 4.2 4.2L19 6.5" />,
  x: <path d="m6 6 12 12M18 6 6 18" />,
  more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>,
  pencil: <><path d="m14.5 5.5 4 4M4.5 19.5l3.2-.7 10.8-10.8a2.8 2.8 0 0 0-4-4L3.7 14.8l-.7 4.7Z" /></>,
  send: <><path d="m21 3-8.3 18-2.5-7.2L3 11.3 21 3Z" /><path d="m10.2 13.8 4.1-4.1" /></>,
  sparkles: <><path d="m12 3 .8 4.2L17 8l-4.2.8L12 13l-.8-4.2L7 8l4.2-.8L12 3ZM18.5 14l.45 2.05L21 16.5l-2.05.45L18.5 19l-.45-2.05L16 16.5l2.05-.45L18.5 14ZM5.5 14l.45 2.05L8 16.5l-2.05.45L5.5 19l-.45-2.05L3 16.5l2.05-.45L5.5 14Z" /></>,
  bookmark: <path d="M7 4.5A1.5 1.5 0 0 1 8.5 3h7A1.5 1.5 0 0 1 17 4.5V21l-5-3-5 3V4.5Z" />,
  bell: <><path d="M18 10a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 22h4" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
};

export function Icon({ name, size = 20, className = '', strokeWidth = 1.8 }) {
  return (
    <svg className={`icon ${className}`.trim()} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name] ?? ICON_PATHS.sparkles}
    </svg>
  );
}
