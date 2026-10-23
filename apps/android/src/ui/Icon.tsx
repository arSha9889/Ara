import Svg, { Circle, Line, Path } from 'react-native-svg';

import { colors } from '../theme/theme';

export type IconName =
  | 'back'
  | 'bluetooth'
  | 'call'
  | 'cameraSwitch'
  | 'check'
  | 'chevronDown'
  | 'chevronRight'
  | 'close'
  | 'compose'
  | 'download'
  | 'file'
  | 'groups'
  | 'hangUp'
  | 'microphone'
  | 'microphoneOff'
  | 'more'
  | 'pause'
  | 'photo'
  | 'play'
  | 'plus'
  | 'pin'
  | 'profile'
  | 'refresh'
  | 'reply'
  | 'search'
  | 'send'
  | 'settings'
  | 'speaker'
  | 'stop'
  | 'video'
  | 'videoOff'
  | 'videoNote'
  | 'chats';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
}

export function Icon({ name, size = 24, color = colors.text }: IconProps) {
  const common = {
    fill: 'none',
    stroke: color,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.8,
  };

  return (
    <Svg accessibilityElementsHidden height={size} viewBox="0 0 24 24" width={size}>
      {name === 'back' ? <Path {...common} d="m15 18-6-6 6-6" /> : null}
      {name === 'bluetooth' ? <><Path {...common} d="m12 3 4.5 4.5L12 12l4.5 4.5L12 21V3Z" /><Path {...common} d="m5 7 10 10M5 17 15 7" /></> : null}
      {name === 'call' ? <Path {...common} d="M7.6 3.8 5.1 5.2c-.8.5-1.2 1.5-.9 2.4 1.6 5 5.5 8.9 10.5 10.5.9.3 1.9-.1 2.4-.9l1.4-2.5-3.2-2.1-1.6 1.2a13.2 13.2 0 0 1-3.6-3.6l1.2-1.6-2.1-3.2Z" /> : null}
      {name === 'cameraSwitch' ? <><Path {...common} d="M4 7h10.5v10H4z" /><Path {...common} d="m14.5 10 5-3v10l-5-3" /><Path {...common} d="M8.2 11a3.8 3.8 0 0 1 5.4-1.7M10.4 15a3.8 3.8 0 0 1-2.1-2.9" /><Path {...common} d="m13.9 8.5-.3 2.8-2.6-1M8.1 15.5l.3-2.8 2.6 1" /></> : null}
      {name === 'check' ? <Path {...common} d="m5 12 4.2 4L19 6.5" /> : null}
      {name === 'chevronDown' ? <Path {...common} d="m6 9 6 6 6-6" /> : null}
      {name === 'chevronRight' ? <Path {...common} d="m9 18 6-6-6-6" /> : null}
      {name === 'close' ? <><Line {...common} x1="6" x2="18" y1="6" y2="18" /><Line {...common} x1="18" x2="6" y1="6" y2="18" /></> : null}
      {name === 'compose' ? <><Path {...common} d="m14.7 4.3 5 5" /><Path {...common} d="M4.5 19.5l4.2-.9L20 7.3a2.1 2.1 0 0 0-3-3L5.7 15.6l-1.2 3.9Z" /></> : null}
      {name === 'download' ? <><Path {...common} d="M12 4v10" /><Path {...common} d="m8 10 4 4 4-4M5 20h14" /></> : null}
      {name === 'file' ? <><Path {...common} d="M7 3.5h6l4 4V20.5H7z" /><Path {...common} d="M13 3.5v4h4M9.5 13h5M9.5 16h5" /></> : null}
      {name === 'groups' ? <><Circle {...common} cx="9" cy="9" r="3" /><Circle {...common} cx="17" cy="10" r="2.3" /><Path {...common} d="M3.8 20c.6-3.4 2.7-5.3 5.2-5.3s4.6 1.9 5.2 5.3M15.2 15.2c2.7.4 4.4 2.1 5 4.8" /></> : null}
      {name === 'hangUp' ? <Path {...common} d="M5.3 16.9 3.8 14c-.4-.8-.1-1.8.6-2.3a12.8 12.8 0 0 1 15.2 0c.7.5 1 1.5.6 2.3l-1.5 2.9-3.4-1.2.2-2a9 9 0 0 0-7 0l.2 2-3.4 1.2Z" /> : null}
      {name === 'microphone' ? <><Path {...common} d="M12 4.2a2.7 2.7 0 0 0-2.7 2.7v5.2a2.7 2.7 0 1 0 5.4 0V6.9A2.7 2.7 0 0 0 12 4.2Z" /><Path {...common} d="M6.9 11.8a5.1 5.1 0 0 0 10.2 0M12 16.9v3" /></> : null}
      {name === 'microphoneOff' ? <><Path {...common} d="m5 5 14 14" /><Path {...common} d="M9.3 9.3v2.8a2.7 2.7 0 0 0 4.4 2.1M14.7 10.5V6.9a2.7 2.7 0 0 0-4.5-2M6.9 11.8a5.1 5.1 0 0 0 8.6 3.8M17.1 11.8c0 .5-.1.9-.2 1.3M12 16.9v3" /></> : null}
      {name === 'more' ? <><Circle fill={color} cx="5" cy="12" r="1.35" /><Circle fill={color} cx="12" cy="12" r="1.35" /><Circle fill={color} cx="19" cy="12" r="1.35" /></> : null}
      {name === 'pause' ? <><Path {...common} d="M9 6v12M15 6v12" strokeWidth={2.4} /></> : null}
      {name === 'photo' ? <><Path {...common} d="M4 5.5h16v13H4z" /><Circle {...common} cx="9" cy="10" r="1.5" /><Path {...common} d="m4 16 4.5-4.5 3 3L14 12l6 6" /></> : null}
      {name === 'play' ? <Path fill={color} stroke="none" d="m9 6 9 6-9 6V6Z" /> : null}
      {name === 'plus' ? <Path {...common} d="M12 5v14M5 12h14" /> : null}
      {name === 'pin' ? <><Path {...common} d="M8.5 4.5h7M9.5 4.5v4l-2.5 3h10l-2.5-3v-4M12 11.5V20" /><Path {...common} d="M9.5 4.5h5" /></> : null}
      {name === 'profile' ? <><Circle {...common} cx="12" cy="8" r="3.6" /><Path {...common} d="M4.8 20c.7-3.1 3.4-5.1 7.2-5.1s6.5 2 7.2 5.1" /></> : null}
      {name === 'refresh' ? <><Path {...common} d="M20 8.5A8.2 8.2 0 1 0 20.1 15" /><Path {...common} d="M20 4.8v3.9h-3.9" /></> : null}
      {name === 'reply' ? <><Path {...common} d="m9 7-5 5 5 5v-3h4.2a5.8 5.8 0 0 1 5.8 5.8V19a8 8 0 0 0-8-8H9V7Z" /></> : null}
      {name === 'search' ? <><Circle {...common} cx="10.7" cy="10.7" r="5.8" /><Path {...common} d="m15.1 15.1 4.2 4.2" /></> : null}
      {name === 'send' ? <Path {...common} d="m20 4-7.1 16-2.3-6.6L4 11.1 20 4Z" /> : null}
      {name === 'settings' ? <><Circle {...common} cx="12" cy="12" r="3" /><Path {...common} d="M19.4 13.3a7.9 7.9 0 0 0 .1-2.6l2-1.5-2-3.4-2.4 1a8 8 0 0 0-2.2-1.3L14.6 3h-4l-.3 2.5a8 8 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.5a7.9 7.9 0 0 0 .1 2.6l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 2.2 1.3l.3 2.5h4l.3-2.5a8 8 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.5Z" /></> : null}
      {name === 'speaker' ? <><Path {...common} d="M4.5 9.3h3.3l4.2-3.4v12.2l-4.2-3.4H4.5V9.3Z" /><Path {...common} d="M15.2 9a4.2 4.2 0 0 1 0 6M17.8 6.5a7.6 7.6 0 0 1 0 11" /></> : null}
      {name === 'stop' ? <Path fill={color} stroke="none" d="M7 7h10v10H7z" /> : null}
      {name === 'video' ? <><Path {...common} d="M4 7h10.5v10H4z" /><Path {...common} d="m14.5 10 5-3v10l-5-3" /></> : null}
      {name === 'videoOff' ? <><Path {...common} d="M4 7h10.5v10H4z" /><Path {...common} d="m14.5 10 5-3v10l-5-3" /><Path {...common} d="m4 4 16 16" /></> : null}
      {name === 'videoNote' ? <><Circle {...common} cx="12" cy="12" r="8.25" /><Path fill={color} stroke="none" d="m10.2 8.8 5.4 3.2-5.4 3.2V8.8Z" /></> : null}
      {name === 'chats' ? <><Path {...common} d="M5.7 17.4 4.5 21l4.2-1.6a8.5 8.5 0 0 0 10.8-1.1 7.6 7.6 0 0 0 0-10.6 8.5 8.5 0 0 0-11 0 7.5 7.5 0 0 0-2.8 9.7Z" /><Path {...common} d="M8.5 12h7" /></> : null}
    </Svg>
  );
}
