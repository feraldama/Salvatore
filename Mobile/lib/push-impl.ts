// Implementación real del módulo de push, aislada en un archivo que sólo se
// importa dinámicamente cuando NO estamos en Expo Go. expo-notifications
// dispara un error al evaluar su index.js dentro de Expo Go (SDK 53+
// removió push), así que el import top-level rompería la app.

import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { registrarPushToken } from './api/push';

export async function configurarHandlerForegroundImpl(): Promise<void> {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('incidencias', {
      name: 'Incidencias',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2D7A4F',
    });
    await Notifications.setNotificationChannelAsync('flota', {
      name: 'Flota',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0176d3',
    });
  }
}

export async function registrarseParaPushImpl(): Promise<string | null> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (status !== 'granted') {
    const res = await Notifications.requestPermissionsAsync();
    status = res.status;
  }
  if (status !== 'granted') return null;

  const projectId =
    (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ??
    (Constants.easConfig as { projectId?: string } | undefined)?.projectId;

  try {
    const tokenData = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;
    const plataforma: 'ios' | 'android' | 'web' =
      Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
    await registrarPushToken(token, plataforma);
    return token;
  } catch {
    return null;
  }
}

// Nota: NO registramos `addNotificationResponseReceivedListener` ni
// `getLastNotificationResponseAsync` acá. Desde expo-router SDK 49+, el
// router maneja automáticamente el deep-link cuando la notificación lleva
// `data.url` con el scheme + path (ej. `mobile:///incidencia/abc-123`).
// El backend setea ese campo en el payload, y expo-router intercepta el tap
// para hacer `router.push(...)`. Agregar nuestro listener acá causaba el
// error "linking configurado en múltiples lugares".
