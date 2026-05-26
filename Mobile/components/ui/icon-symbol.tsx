// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight, SymbolViewProps } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 *
 * Usamos `satisfies` en vez de `as`: TS valida que cada KEY sea un SF Symbol
 * real (universo `SymbolViewProps['name']`) y que cada VALUE sea un nombre
 * válido de MaterialIcons, pero conserva el tipo literal del objeto. Eso
 * permite que `keyof typeof MAPPING` saque sólo las keys REALMENTE
 * declaradas — si alguien pasa un nombre que no agregamos acá, TS rompe en
 * compile-time (en vez del silencio que tirábamos antes en Android).
 */
const MAPPING = {
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  'person.fill': 'person',
  'exclamationmark.triangle.fill': 'warning',
  'map.fill': 'map',
  'clock.fill': 'schedule',
  'car.fill': 'directions-car',
  'fuelpump.fill': 'local-gas-station',
  'wrench.fill': 'build',
  'calendar': 'event',
} satisfies Partial<Record<SymbolViewProps['name'], ComponentProps<typeof MaterialIcons>['name']>>;

/// Universo público de nombres aceptados por `IconSymbol` en TODA la app.
/// Tanto la versión Android (este archivo) como la iOS (icon-symbol.ios.tsx)
/// importan este tipo, así no se puede pasar un name no mapeado y romper
/// silenciosamente en Android.
export type IconSymbolName = keyof typeof MAPPING;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
