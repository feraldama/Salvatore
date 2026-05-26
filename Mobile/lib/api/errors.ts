import axios from 'axios';

/// Extrae el mensaje de error útil de cualquier respuesta de API. Prioridad:
///   1. err.response.data.message  (formato estándar del ERP/CMS)
///   2. err.response.data.error    (algunos endpoints viejos)
///   3. err.message                (de axios, ej. "Network Error" si no hubo
///                                  conexión, o "timeout of 15000ms exceeded")
///   4. fallback                   (último recurso)
///
/// Antes el mobile mostraba `e.message` directo en los Alert.alert, lo que
/// con axios da "Request failed with status code 400" sin info útil al
/// usuario. Ahora extrae el message real del backend cuando existe.
export function getApiErrorMessage(err: unknown, fallback = 'Ocurrió un error'): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as
      | { message?: string; error?: string }
      | undefined;
    if (typeof data?.message === 'string' && data.message.trim()) return data.message;
    if (typeof data?.error === 'string' && data.error.trim()) return data.error;
    if (err.message === 'Network Error') return 'Sin conexión a internet.';
    if (err.code === 'ECONNABORTED') return 'La operación tardó demasiado. Reintentá.';
    return err.message || fallback;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
