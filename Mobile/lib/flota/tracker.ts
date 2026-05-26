import * as Location from 'expo-location';

import { TASK_UBICACION_VIAJE } from './background-task';
import { flush as flushUbicaciones } from './sender';
import { intentarCierre } from './cierre-pendiente';

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
let intervalMsActual = DEFAULT_INTERVAL_MS;

export interface OpcionesTracking {
  intervaloMs?: number;
}

/// Arranca location updates en background. En Android levanta una notificación
/// persistente (requisito desde Android 10 para usar location en background);
/// en iOS muestra el indicador azul de "app está usando tu ubicación".
///
/// `pausesUpdatesAutomatically: false` es clave — sin esto, iOS puede pausar
/// el tracking cuando el sensor detecta que el dispositivo está estacionario
/// (chofer estacionado, semáforo largo). Para auditoría de flota queremos el
/// stream continuo.
export async function iniciarTracking(opts: OpcionesTracking = {}): Promise<void> {
  const intervaloMs = opts.intervaloMs ?? DEFAULT_INTERVAL_MS;

  const yaCorre = await Location.hasStartedLocationUpdatesAsync(TASK_UBICACION_VIAJE);
  if (yaCorre && intervaloMs === intervalMsActual) {
    return; // idempotente
  }
  if (yaCorre) {
    await Location.stopLocationUpdatesAsync(TASK_UBICACION_VIAJE);
  }

  // Combinación de time+distance dispara el primero que se cumpla:
  //   - timeInterval: heartbeat máximo cuando está PARADO (semáforo, etc.)
  //     — al menos un ping cada X para confirmar que el celu sigue vivo.
  //   - distanceInterval: ping cada 50m cuando se está MOVIENDO. En autopista
  //     a 90km/h dispara cada ~2s; en urbano lento, cada ~6s. Pings densos
  //     donde importan (en movimiento) y silencio cuando no hay info nueva.
  //
  // Accuracy High = ~3-10m vs Balanced ~10-100m. Crucial para que Snap to
  // Roads reconstruya la calle correcta — con puntos sucios la reconstrucción
  // server-side se equivoca de carretera en intersecciones complejas.
  await Location.startLocationUpdatesAsync(TASK_UBICACION_VIAJE, {
    accuracy: Location.Accuracy.High,
    timeInterval: intervaloMs,
    distanceInterval: 50,
    showsBackgroundLocationIndicator: true,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.AutomotiveNavigation,
    foregroundService: {
      notificationTitle: 'Viaje JWF en curso',
      notificationBody: 'Registrando tu ubicación para el control de flota.',
      notificationColor: '#2D7A4F',
    },
  });
  intervalMsActual = intervaloMs;
}

export async function detenerTracking(): Promise<void> {
  const yaCorre = await Location.hasStartedLocationUpdatesAsync(TASK_UBICACION_VIAJE);
  if (yaCorre) {
    await Location.stopLocationUpdatesAsync(TASK_UBICACION_VIAJE);
  }
}

export async function trackingActivo(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(TASK_UBICACION_VIAJE);
}

/// Dispara un intento de drenar todo lo pendiente: primero los puntos de la
/// cola, después el cierre pendiente si lo hay. Llamado en cada trigger de
/// "tenemos red de nuevo" (NetInfo) y "la app volvió a foreground".
export async function flushAhora(): Promise<void> {
  await flushUbicaciones();
  await intentarCierre();
}

/// Pide ambos permisos: foreground primero, después background. iOS exige el
/// flujo en dos pasos — si pedís background de entrada, el OS lo deniega
/// silenciosamente. Devuelve un texto explicativo cuando falta algo, para que
/// la UI lo pueda mostrar al chofer.
export async function asegurarPermisosTracking(): Promise<{
  ok: boolean;
  motivo?: string;
}> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') {
    return {
      ok: false,
      motivo: 'Sin permiso de ubicación no podemos registrar el viaje.',
    };
  }
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') {
    return {
      ok: false,
      motivo:
        'Para que el viaje siga registrando con la pantalla bloqueada, habilitá "Permitir siempre" en Configuración → Apps → JWF Mobile → Permisos → Ubicación.',
    };
  }
  return { ok: true };
}
