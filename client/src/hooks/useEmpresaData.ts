import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/useAuth";

/**
 * Hook para cargar datos que dependen de la empresa activa.
 *
 * Resuelve de raíz el bug de "no se actualiza al cambiar de empresa":
 * vuelve a ejecutar el fetcher automáticamente cada vez que cambia la
 * empresa activa. El fetcher recibe el EmpresaId activo.
 *
 * Ejemplo:
 *   const { data, loading, error, reload } = useEmpresaData(
 *     (empresaId) => getVendedores(empresaId)
 *   );
 */
export function useEmpresaData<T>(
  fetcher: (empresaId: number | undefined) => Promise<T>,
  initialData: T
) {
  const { empresaActiva } = useAuth();
  const empresaId = empresaActiva?.EmpresaId;

  const [data, setData] = useState<T>(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetcher(empresaId);
      setData(result);
    } catch (err) {
      const e = err as { message?: string };
      setError(e?.message || (err instanceof Error ? err.message : "Error desconocido"));
    } finally {
      setLoading(false);
    }
    // El fetcher se asume estable (definido fuera o memoizado por el caller).
    // empresaId es la dependencia real que dispara el refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload, empresaId };
}
