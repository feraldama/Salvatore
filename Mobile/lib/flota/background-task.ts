import * as Location from 'expo-location';

import { ES_EXPO_GO } from '@/lib/runtime';
import { encolarYFlush } from './sender';

/// Nombre estable del background task. NO cambiarlo entre releases — el OS lo
/// usa como identificador para asociar las wake-ups al callback. Si lo
/// renombrás, los celulares que tengan el task viejo registrado quedan con un
/// fantasma que no apunta a ningún handler hasta el próximo install.
export const TASK_UBICACION_VIAJE = 'flota-ubicacion-viaje';

/// Este `defineTask` DEBE ejecutarse en el módulo top-level, antes de que el
/// OS dispare el task. Por eso importamos este archivo desde `_layout.tsx`
/// (root) para que se evalúe en cada arranque del JS, incluso cuando el OS
/// despierta el proceso por una location update sin que el usuario haya
/// abierto la app.
///
/// En Expo Go el módulo nativo no existe (Expo lo removió del cliente Store
/// en SDK 49+). Hacemos el require + defineTask SOLO fuera de Expo Go para
/// que la app boote igual en dev — el tracking en background simplemente no
/// funciona ahí, pero el resto de la app sí. En APK release / dev build
/// funciona normal.
if (!ES_EXPO_GO) {
  // Dynamic require para que el módulo no se evalúe siquiera en Expo Go
  // (importarlo top-level tira al cargar el bundle).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const TaskManager = require('expo-task-manager') as typeof import('expo-task-manager');
  TaskManager.defineTask(TASK_UBICACION_VIAJE, async ({ data, error }) => {
    if (error) {
      return;
    }
    if (!data) return;

    const { locations } = data as { locations: Location.LocationObject[] };
    if (!locations || locations.length === 0) return;

    for (const loc of locations) {
      await encolarYFlush({
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        accuracy: loc.coords.accuracy ?? null,
        // El timestamp del fix del GPS, no de "ahora" — fundamental para que
        // un punto encolado horas antes mantenga su tiempo real al drenar.
        capturado_en: new Date(loc.timestamp).toISOString(),
      });
    }
  });
}
