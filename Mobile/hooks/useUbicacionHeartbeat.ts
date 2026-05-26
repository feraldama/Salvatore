import * as Location from 'expo-location';
import { useEffect, useRef } from 'react';

import { useAuth, useRoles } from '@/lib/auth/AuthContext';
import { reportarUbicacion } from '@/lib/api/ubicacion';

// Cada cuánto reporta la ubicación al backend. 5 min es el balance entre
// frescura para el cercano-finder (6h max edad backend) y consumo de
// batería. Suficiente para una flota de mantenimiento que se mueve en
// minutos, no en segundos.
const HEARTBEAT_MS = 5 * 60 * 1000;

/// Pide permiso de location la primera vez que un técnico abre la app, y
/// después manda un POST /monitoreo/ubicacion cada 5 min y al volver al
/// foreground. Best-effort: si el user niega el permiso o GPS está apagado,
/// no insiste — el auto-asignador hace fallback a round-robin en el backend.
///
/// Llamar UNA VEZ desde el root layout (dentro del AuthProvider).
export function useUbicacionHeartbeat() {
  const { user } = useAuth();
  const { isTecnico } = useRoles();
  const permisoOtorgadoRef = useRef(false);

  useEffect(() => {
    if (!user || !isTecnico) return;

    let cancelado = false;

    async function obtenerYEnviar() {
      try {
        if (!permisoOtorgadoRef.current) {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') return;
          permisoOtorgadoRef.current = true;
        }
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelado) return;
        await reportarUbicacion({
          latitud: pos.coords.latitude,
          longitud: pos.coords.longitude,
          exactitudM: pos.coords.accuracy ?? undefined,
        });
      } catch {
        // Silencio: si GPS apagado, sin red, etc. el backend mantiene la
        // última ubicación conocida (puede ser viable hasta 6h).
      }
    }

    // Primer fix al montar.
    void obtenerYEnviar();
    // Intervalo después.
    const handle = setInterval(() => {
      void obtenerYEnviar();
    }, HEARTBEAT_MS);

    return () => {
      cancelado = true;
      clearInterval(handle);
    };
  }, [user, isTecnico]);
}
