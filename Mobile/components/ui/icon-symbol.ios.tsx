import { SymbolView, SymbolWeight } from 'expo-symbols';
import { StyleProp, ViewStyle } from 'react-native';
// El tipo público se exporta desde el archivo Android (./icon-symbol.tsx) que
// es el "fallback" sin extensión de plataforma — Metro resuelve .ios.tsx en
// iOS y .tsx en el resto, pero TypeScript resuelve siempre el .tsx default
// para los imports. Así forzamos que iOS use SOLO los nombres mapeados, no
// el universo entero de SF Symbols.
import type { IconSymbolName } from './icon-symbol';

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
  weight = 'regular',
}: {
  name: IconSymbolName;
  size?: number;
  color: string;
  style?: StyleProp<ViewStyle>;
  weight?: SymbolWeight;
}) {
  return (
    <SymbolView
      weight={weight}
      tintColor={color}
      resizeMode="scaleAspectFit"
      name={name}
      style={[
        {
          width: size,
          height: size,
        },
        style,
      ]}
    />
  );
}
