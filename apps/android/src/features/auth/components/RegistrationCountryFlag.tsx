import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import type { RegistrationCountry } from '../registrationCountry';
import { colors } from '../../../theme/theme';

interface RegistrationCountryFlagProps {
  country: RegistrationCountry;
}

export function RegistrationCountryFlag({ country }: RegistrationCountryFlagProps) {
  return (
    <View accessible={false} style={styles.frame}>
      <Svg height={30} viewBox="0 0 32 24" width={40}>
        {country === 'RU' ? <RussiaFlag /> : null}
        {country === 'KZ' ? <KazakhstanFlag /> : null}
        {country === 'KG' ? <KyrgyzstanFlag /> : null}
        {country === 'BY' ? <BelarusFlag /> : null}
        {country === 'UZ' ? <UzbekistanFlag /> : null}
        {country === 'UA' ? <UkraineFlag /> : null}
      </Svg>
    </View>
  );
}

function RussiaFlag() {
  return (
    <>
      <Rect fill="#F4F7FB" height="8" width="32" y="0" />
      <Rect fill="#2354A5" height="8" width="32" y="8" />
      <Rect fill="#D52B1E" height="8" width="32" y="16" />
    </>
  );
}

function KazakhstanFlag() {
  return (
    <>
      <Rect fill="#00AFCA" height="24" width="32" />
      <Rect fill="#FEC50C" height="24" width="3" />
      <Circle cx="18" cy="9" fill="#FEC50C" r="3.15" />
      <Path d="M18 4.15V2.8M18 15.2v-1.35M13.15 9h-1.35M24.2 9h-1.35M14.6 5.6l-.95-.95M22.35 13.35l-.95-.95M21.4 5.6l.95-.95M13.65 13.35l.95-.95" stroke="#FEC50C" strokeLinecap="round" strokeWidth="0.85" />
      <Path d="M12.7 17c2.1-1.35 4.3-1.35 6.6 0 1.2.7 2.3.65 3.2.15-.9 1.8-2.45 2.65-4.65 2.55-2.15-.1-3.8-.95-5.15-2.7Z" fill="#FEC50C" />
    </>
  );
}

function KyrgyzstanFlag() {
  return (
    <>
      <Rect fill="#E8112D" height="24" width="32" />
      <Circle cx="16" cy="12" fill="#FFCF00" r="5.8" />
      <Circle cx="16" cy="12" fill="none" r="3.5" stroke="#E8112D" strokeWidth="0.9" />
      <Path d="M12.9 9.1 19.1 14.9M19.1 9.1l-6.2 5.8M16 8.5v7M12.5 12h7" stroke="#E8112D" strokeWidth="0.8" />
      <Path d="M16 4.4v-1.5M16 21.1v-1.5M8.4 12H6.9M25.1 12h-1.5M10.65 6.65 9.6 5.6M22.4 18.4l-1.05-1.05M21.35 6.65 22.4 5.6M9.6 18.4l1.05-1.05" stroke="#FFCF00" strokeLinecap="round" strokeWidth="1.1" />
    </>
  );
}

function BelarusFlag() {
  return (
    <>
      <Rect fill="#FFFFFF" height="24" width="4" />
      <Rect fill="#D22730" height="16" width="28" x="4" />
      <Rect fill="#009A44" height="8" width="28" x="4" y="16" />
      <Path d="m1 1 2 2-2 2 2 2-2 2 2 2-2 2 2 2-2 2" fill="none" stroke="#D22730" strokeWidth="0.85" />
      <Path d="m3 2-2 2 2 2-2 2 2 2-2 2 2 2-2 2" fill="none" stroke="#D22730" strokeWidth="0.65" />
    </>
  );
}

function UzbekistanFlag() {
  return (
    <>
      <Rect fill="#0099B5" height="7" width="32" />
      <Rect fill="#FFFFFF" height="10" width="32" y="7" />
      <Rect fill="#1EB53A" height="7" width="32" y="17" />
      <Rect fill="#CE1126" height="0.7" width="32" y="7" />
      <Rect fill="#CE1126" height="0.7" width="32" y="16.3" />
      <Circle cx="6.2" cy="3.8" fill="#FFFFFF" r="2.1" />
      <Circle cx="7.05" cy="3.25" fill="#0099B5" r="2.1" />
      <Circle cx="10.1" cy="2.2" fill="#FFFFFF" r="0.35" />
      <Circle cx="11.5" cy="3.6" fill="#FFFFFF" r="0.35" />
      <Circle cx="12.9" cy="2.2" fill="#FFFFFF" r="0.35" />
      <Circle cx="14.3" cy="3.6" fill="#FFFFFF" r="0.35" />
      <Circle cx="15.7" cy="2.2" fill="#FFFFFF" r="0.35" />
    </>
  );
}

function UkraineFlag() {
  return (
    <>
      <Rect fill="#1565C0" height="12" width="32" />
      <Rect fill="#FFD700" height="12" width="32" y="12" />
    </>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderColor: colors.glassBorder,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    height: 30,
    overflow: 'hidden',
    width: 40,
  },
});
