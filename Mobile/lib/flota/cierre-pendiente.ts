import { getItem, removeItem, setItem } from '@/lib/safe-storage';
import { terminarViaje } from '@/lib/api/flota';
import { flush as flushUbicaciones } from './sender';

/// Si el chofer presiona "Terminar viaje" estando sin red, persistimos la
/// intención (GPS + timestamp del momento real del cierre) y reintentamos en
/// cuanto haya conectividad. Mientras tanto, el viaje sigue abierto server-side
/// y el tracking sigue activo — si el chofer arranca otra vez, los puntos
/// extra siguen entrando a la cola normal y se persisten contra el mismo
/// viaje. Cuando finalmente cierra, el `fin_en` queda con el `capturado_en`
/// real (no el momento del reintento exitoso).

const KEY = 'flota:cierre-pendiente:v1';

export interface CierrePendiente {
  lat: number;
  lng: number;
  accuracy: number | null;
  capturado_en: string;
}

export async function setPendiente(c: CierrePendiente): Promise<void> {
  await setItem(KEY, JSON.stringify(c));
}

export async function obtener(): Promise<CierrePendiente | null> {
  const raw = await getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CierrePendiente;
  } catch {
    return null;
  }
}

export async function limpiar(): Promise<void> {
  await removeItem(KEY);
}

let intentando = false;

/// Devuelve true si el server confirmó el cierre (o no había nada pendiente).
/// Devuelve false si el cierre no pudo completarse (sigue offline / error).
export async function intentarCierre(): Promise<boolean> {
  if (intentando) return false;
  intentando = true;
  try {
    const c = await obtener();
    if (!c) return true;

    // Primero drenamos los puntos pendientes — queremos que el track quede
    // completo antes de que el server marque el viaje como CERRADO.
    await flushUbicaciones();

    try {
      await terminarViaje({
        lat: c.lat,
        lng: c.lng,
        accuracy: c.accuracy ?? undefined,
        capturado_en: c.capturado_en,
      });
      await limpiar();
      return true;
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        // El server dice que ya no hay viaje abierto — alguien lo cerró por
        // otro lado (ej. admin desde el ERP). Limpiamos para no quedar
        // reintentando algo imposible.
        await limpiar();
        return true;
      }
      return false;
    }
  } finally {
    intentando = false;
  }
}
