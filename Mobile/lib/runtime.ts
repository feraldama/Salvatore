// Helpers de detección de runtime — usados como guard de módulos nativos que
// no existen en Expo Go (desde SDK 53 expo-task-manager, expo-secure-store y
// otros fueron removidos del cliente Store para reducir tamaño). Cuando
// algún módulo requiere autolinking nativo, lo wrappeamos con esta flag
// para que la app boote en Expo Go sin las features de background — y siga
// funcionando normal en dev build / APK release.

import Constants, { ExecutionEnvironment } from 'expo-constants';

/// `true` cuando la app corre dentro del cliente Expo Go (Store o TestFlight
/// del propio Expo). En ese caso, los módulos nativos extra (TaskManager,
/// SecureStore, AsyncStorage, expo-location en background, etc.) NO están
/// disponibles. Comprobá esta flag antes de tocar APIs nativas opcionales.
export const ES_EXPO_GO =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
