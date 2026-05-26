import { getItem, setItem } from '@/lib/safe-storage';

/// Cola persistida de puntos GPS que aún no llegaron al ERP. Sobrevive a
/// pierdas de conexión, app en background, cierre del proceso por el OS, y
/// reinicios del celu. El tracker push() acá ANTES de intentar el POST; si el
/// envío falla (offline, server caído, timeout) los puntos quedan hasta el
/// próximo flush.
///
/// Storage: una sola clave con un array JSON. Para los volúmenes que manejamos
/// (un viaje de 8 hs a 1 ping/5 min ≈ 96 puntos × ~80 bytes = ~8KB) es
/// suficiente — no justifica SQLite ni MMKV.

const KEY = 'flota:ubicacion-queue:v1';
const MAX_PUNTOS = 5000; // ~30 días de buffer a 5min de ritmo, por si pasa lo imposible

export interface PuntoEncolado {
  lat: number;
  lng: number;
  accuracy: number | null;
  capturado_en: string; // ISO8601 del momento real de captura en el celu
  /// Usuario que estaba logueado cuando se generó el punto. Optional para
  /// compat con puntos viejos pre-fix; en puntos nuevos siempre va. El sender
  /// lo usa para descartar puntos si después se loguea otro chofer.
  usuario_id?: number;
}

let memoria: PuntoEncolado[] | null = null;
let cargandoMemoria: Promise<PuntoEncolado[]> | null = null;

async function cargar(): Promise<PuntoEncolado[]> {
  if (memoria) return memoria;
  if (cargandoMemoria) return cargandoMemoria;
  cargandoMemoria = (async () => {
    try {
      const raw = await getItem(KEY);
      memoria = raw ? (JSON.parse(raw) as PuntoEncolado[]) : [];
    } catch {
      memoria = [];
    }
    cargandoMemoria = null;
    return memoria;
  })();
  return cargandoMemoria;
}

async function persistir(puntos: PuntoEncolado[]): Promise<void> {
  memoria = puntos;
  await setItem(KEY, JSON.stringify(puntos));
}

export async function encolar(p: PuntoEncolado): Promise<void> {
  const lista = await cargar();
  lista.push(p);
  // Cap defensivo: si por algún bug se infló sin freno, descartamos los más
  // viejos (probablemente ya no valen para reconstruir nada útil).
  if (lista.length > MAX_PUNTOS) lista.splice(0, lista.length - MAX_PUNTOS);
  await persistir(lista);
}

export async function peek(limite: number): Promise<PuntoEncolado[]> {
  const lista = await cargar();
  return lista.slice(0, limite);
}

/// Elimina los primeros N puntos (los que ya fueron confirmados por el server).
/// Tomamos del FRENTE para mantener orden FIFO — combinado con el batch
/// que ordena por capturado_en server-side, garantiza reconstrucción temporal
/// correcta.
export async function descartarFrente(n: number): Promise<void> {
  const lista = await cargar();
  if (n >= lista.length) {
    await persistir([]);
    return;
  }
  await persistir(lista.slice(n));
}

export async function tamano(): Promise<number> {
  const lista = await cargar();
  return lista.length;
}

export async function vaciar(): Promise<void> {
  await persistir([]);
}
