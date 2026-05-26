// Persiste el usuario_id que está siendo trackeado actualmente. Lo usan dos
// piezas que NO viven dentro del React tree y por tanto no pueden leer del
// AuthContext:
//
//   1. El background task de location updates (corre headless cuando el OS
//      despierta el proceso). Necesita saber quién generó cada punto para
//      etiquetarlo y que no se contamine si después se loguea otro chofer.
//
//   2. El sender que drena la cola al backend. Antes de mandar puntos viejos
//      necesita confirmar que pertenecen al usuario actual; sino los descarta.
//
// La clave es escribir esto cuando se INICIA tracking (con el user autenticado
// disponible) y leerlo en cualquier momento posterior — incluso si el JWT
// expiró o no hay sesión activa.

import { getItem, removeItem, setItem } from '@/lib/safe-storage';

const KEY = 'flota:sesion-tracking:usuario-id';

export async function setUsuarioTracking(id: number): Promise<void> {
  await setItem(KEY, String(id));
}

export async function getUsuarioTracking(): Promise<number | null> {
  const raw = await getItem(KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function limpiarUsuarioTracking(): Promise<void> {
  await removeItem(KEY);
}
