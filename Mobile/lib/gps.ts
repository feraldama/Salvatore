import { Alert, Linking } from 'react-native';
import * as Location from 'expo-location';

export interface GpsFix {
  lat: number;
  lng: number;
  accuracy?: number;
}

/** Obtiene posición actual; lanza Error con mensaje en español si falla. */
export async function obtenerGpsObligatorio(): Promise<GpsFix> {
  const servicesOn = await Location.hasServicesEnabledAsync();
  if (!servicesOn) {
    throw new Error('Activá el GPS del dispositivo en Configuración → Ubicación.');
  }

  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') {
    throw new Error('Se requiere permiso de ubicación para continuar.');
  }

  let pos: Location.LocationObject | null = null;
  try {
    pos = await Location.getLastKnownPositionAsync({ maxAge: 60_000 });
  } catch {
    /* ignorar */
  }
  try {
    pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  } catch {
    if (!pos) {
      throw new Error(
        'No se pudo obtener tu ubicación. Probá al aire libre o abrí Maps una vez para forzar el GPS.',
      );
    }
  }

  if (!pos) {
    throw new Error('No se pudo obtener tu ubicación.');
  }

  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy ?? undefined,
  };
}

export function alertaGpsError(err: unknown) {
  const msg = err instanceof Error ? err.message : 'Error de ubicación';
  Alert.alert('GPS requerido', msg, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Abrir ajustes', onPress: () => Linking.openSettings() },
  ]);
}
