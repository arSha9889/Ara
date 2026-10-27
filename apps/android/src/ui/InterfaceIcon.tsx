import { Image, StyleSheet, type ImageStyle, type StyleProp } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

export type InterfaceIconName = 'bell' | 'bullhorn' | 'phoneCall' | 'settings' | 'videoCamera';

interface InterfaceIconProps {
  name: InterfaceIconName;
  size?: number;
  color?: string;
  style?: StyleProp<ImageStyle>;
}

const sources: Record<InterfaceIconName, number> = {
  bell: require('../assets/interface-icons/bell.png'),
  bullhorn: require('../assets/interface-icons/bullhorn.png'),
  phoneCall: require('../assets/interface-icons/phone-call.png'),
  settings: require('../assets/interface-icons/settings.png'),
  videoCamera: require('../assets/interface-icons/video-camera.png'),
};

export function InterfaceIcon({ name, size = 24, color, style }: InterfaceIconProps) {
  const { colors } = useTheme();

  return (
    <Image
      accessible={false}
      resizeMode="contain"
      source={sources[name]}
      style={[styles.image, { height: size, tintColor: color ?? colors.text, width: size }, style]}
    />
  );
}

const styles = StyleSheet.create({
  image: {
    opacity: 0.96,
  },
});
