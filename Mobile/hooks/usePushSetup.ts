import { useEffect, useRef } from 'react';

import { useAuth } from '@/lib/auth/AuthContext';
import { configurarHandlerForeground, registrarseParaPush } from '@/lib/push';
import { desregistrarPushToken } from '@/lib/api/push';

// Una sola vez por proceso: setea el handler global y el channel de Android.
let handlerConfigurado = false;

/// Pide permiso de notifs, obtiene el Expo Push Token y lo registra en el
/// backend cuando el usuario se loguea. Lo desregistra al logout.
///
/// En Expo Go los métodos son no-op (el módulo `expo-notifications` no se
/// importa) para evitar el error de boot. En dev/standalone builds funciona
/// normal.
///
/// El deep-link de "tap en notificación → /incidencia/[id]" lo maneja
/// expo-router automáticamente: el backend setea `data.url` con scheme+path
/// (ej. `mobile:///incidencia/abc-123`) y expo-router intercepta el tap. No
/// necesitamos addNotificationResponseReceivedListener (causaba conflicto
/// con el linking interno del router).
///
/// Llamar UNA VEZ desde el root layout (dentro del AuthProvider).
export function usePushSetup() {
  const { user } = useAuth();
  const tokenActualRef = useRef<string | null>(null);

  useEffect(() => {
    if (!handlerConfigurado) {
      handlerConfigurado = true;
      void configurarHandlerForeground();
    }

    if (!user) {
      // Logout: desregistrar el token actual si lo teníamos.
      if (tokenActualRef.current) {
        const t = tokenActualRef.current;
        tokenActualRef.current = null;
        void desregistrarPushToken(t).catch(() => undefined);
      }
      return;
    }

    let cancelado = false;
    (async () => {
      const token = await registrarseParaPush();
      if (!cancelado && token) {
        tokenActualRef.current = token;
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [user]);
}
