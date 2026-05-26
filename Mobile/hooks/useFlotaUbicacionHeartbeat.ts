import { useEffect } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useQuery } from '@tanstack/react-query';

import { getFlotaConfig } from '@/lib/api/flota';
import { useAuth, useRoles } from '@/lib/auth/AuthContext';
import { useFlotaViaje } from '@/hooks/useFlotaViaje';
import {
  detenerTracking,
  flushAhora,
  iniciarTracking,
} from '@/lib/flota/tracker';
import { setUsuarioTracking } from '@/lib/flota/sesion-tracking';

// 30s = heartbeat cuando el chofer está PARADO. Cuando se mueve, dispara
// distanceInterval (cada 50m, ver tracker.ts) mucho antes de 30s. Antes era
// 5min, lo que dejaba gaps de varios km entre puntos en autopista.
const DEFAULT_INTERVAL_MS = 30 * 1000;

/// Orquestador global del tracking de viaje. Va en el AuthGate del root layout.
///
/// Responsabilidades:
///   1. Arrancar / detener el background task según haya viaje abierto
///   2. Drenar la cola offline al reconectar la red (NetInfo)
///   3. Drenar la cola al volver la app a foreground (AppState 'active')
///
/// IMPORTANTE: el tracking real lo maneja `expo-location.startLocationUpdatesAsync`
/// vía TaskManager — NO hay `setInterval` JS. Esa diferencia es lo que permite
/// que los pings sigan saliendo con la pantalla bloqueada o la app cerrada.
export function useFlotaUbicacionHeartbeat() {
  const { user } = useAuth();
  const { isChofer } = useRoles();
  const { data: viajeData } = useFlotaViaje();
  const viajeAbierto = !!viajeData?.viaje;

  const { data: config } = useQuery({
    queryKey: ['flota', 'config'],
    queryFn: getFlotaConfig,
    enabled: isChofer,
    staleTime: 5 * 60_000,
  });

  const intervaloMs =
    (config?.ubicacion_intervalo_segundos ?? 300) * 1000 || DEFAULT_INTERVAL_MS;

  // Arrancar/detener el background task según estado del viaje.
  // Caso especial: si el user pasa a null (sesión expirada o logout), también
  // detener tracking — el early return previo NO lo hacía y el GPS seguía
  // gastando batería sin poder enviar nada al backend.
  useEffect(() => {
    if (!isChofer || !user) {
      void detenerTracking();
      return;
    }
    if (viajeAbierto) {
      // Etiquetamos los próximos puntos GPS con este usuario. Si después de
      // expirar la sesión otro chofer se loguea, el sender detectará el
      // mismatch al drenar y descartará los puntos del usuario anterior.
      void setUsuarioTracking(user.id).then(() => iniciarTracking({ intervaloMs }));
    } else {
      void detenerTracking();
    }
  }, [isChofer, user, viajeAbierto, intervaloMs]);

  // Drenar la cola cuando vuelve la conectividad. NetInfo dispara al pasar
  // de offline → online. También dispara con cambios de tipo de red
  // (Wi-Fi ↔ celular) — drenamos también ahí por las dudas.
  useEffect(() => {
    if (!isChofer) return;
    const unsub = NetInfo.addEventListener((s) => {
      if (s.isConnected) {
        void flushAhora();
      }
    });
    return () => unsub();
  }, [isChofer]);

  // Drenar cuando la app vuelve a primer plano. Cubre el caso del chofer que
  // tuvo el celu bloqueado horas sin red, lo desbloquea ya con cobertura, y
  // antes de que NetInfo emita un cambio (ya estaba "conectado") queremos
  // empujar lo que se acumuló.
  useEffect(() => {
    if (!isChofer) return;
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') void flushAhora();
    });
    return () => sub.remove();
  }, [isChofer]);
}
