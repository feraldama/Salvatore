import { reportarUbicacionViajeBatch } from '@/lib/api/flota';
import {
  descartarFrente,
  encolar,
  peek,
  PuntoEncolado,
  tamano,
} from './ubicacion-queue';
import { getUsuarioTracking } from './sesion-tracking';

const BATCH = 200;
let flushing = false;

/// Intenta drenar TODA la cola de puntos al ERP. Mutex en memoria — si una
/// segunda llamada entra mientras la primera todavía no terminó, retorna sin
/// hacer nada. Esto evita que el listener de NetInfo, el AppState 'active' y
/// la llamada al final de cada nuevo punto compitan por enviar lo mismo.
///
/// Si el server rechaza un batch (por ej. token expirado, viaje ya cerrado,
/// 5xx), no descartamos nada: salimos y reintentaremos en el próximo trigger.
/// El único caso donde un punto se "pierde" es si el viaje se cerró server-side
/// y el batch tira 409; entonces los puntos no encajan porque no hay viaje
/// abierto. En ese caso vaciamos la cola — son huérfanos sin destino.
export async function flush(): Promise<{ enviados: number }> {
  if (flushing) return { enviados: 0 };
  flushing = true;
  let totalEnviados = 0;
  try {
    const usuarioActual = await getUsuarioTracking();
    while (true) {
      const lote = await peek(BATCH);
      if (lote.length === 0) return { enviados: totalEnviados };

      // Filtrado por usuario actual. Caso típico: chofer A perdió la sesión,
      // chofer B se loguea en el mismo dispositivo → puntos viejos de A en
      // la cola no deben enviarse con el JWT de B (contaminaría reportes).
      //
      // La cola es FIFO. Procesamos en dos pasos:
      //   1. Descartar huérfanos consecutivos del frente.
      //   2. Tomar puntos válidos consecutivos del frente y enviarlos.
      // Si más adelante hay más huérfanos intercalados, los limpia el
      // siguiente loop. Sin un usuarioActual conocido, no podemos enviar
      // nada — esperamos hasta el próximo login.
      const esHuerfano = (p: PuntoEncolado): boolean =>
        usuarioActual == null ||
        (p.usuario_id != null && p.usuario_id !== usuarioActual);
      let huerfanosFrente = 0;
      while (huerfanosFrente < lote.length && esHuerfano(lote[huerfanosFrente])) {
        huerfanosFrente++;
      }
      if (huerfanosFrente > 0) {
        await descartarFrente(huerfanosFrente);
        continue;
      }
      if (usuarioActual == null) {
        // No hay user activo, no podemos enviar. Salimos hasta el próximo
        // trigger (login, NetInfo, etc.).
        return { enviados: totalEnviados };
      }
      let validosFrente = 0;
      while (validosFrente < lote.length && !esHuerfano(lote[validosFrente])) {
        validosFrente++;
      }
      const adelante = lote.slice(0, validosFrente);

      try {
        const res = await reportarUbicacionViajeBatch(
          adelante.map((p) => ({
            lat: p.lat,
            lng: p.lng,
            accuracy: p.accuracy,
            capturado_en: p.capturado_en,
          })),
        );
        await descartarFrente(res.insertados ?? adelante.length);
        totalEnviados += res.insertados ?? adelante.length;
      } catch (err) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 409) {
          // No hay viaje abierto en el server; los puntos no tienen a dónde
          // adherirse. Limpiamos para no quedar atascados reintentando para
          // siempre.
          const restante = await tamano();
          await descartarFrente(restante);
        }
        return { enviados: totalEnviados };
      }
    }
  } finally {
    flushing = false;
  }
}

export async function encolarYFlush(p: PuntoEncolado): Promise<void> {
  // Si el background task no recibió usuario_id explícito (caller viejo o
  // contexto headless), leemos el último user que inició tracking. Si NO hay
  // ninguno guardado, igual encolamos (el sender descartará al drenar).
  if (p.usuario_id == null) {
    const uid = await getUsuarioTracking();
    if (uid != null) p = { ...p, usuario_id: uid };
  }
  await encolar(p);
  // Fire-and-forget: el background task no necesita esperar el roundtrip
  void flush();
}
