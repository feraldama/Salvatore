import { useQuery } from '@tanstack/react-query';
import { getMisPendientesFlota } from '@/lib/api/flota';
import { useRoles } from '@/lib/auth/AuthContext';

export const FLOTA_PENDIENTES_KEY = ['flota', 'mis-pendientes'] as const;

/// Pendientes (mantenimientos y documentos vencidos/próximos) de los
/// vehículos asignados al chofer. Stale 5 min — esto no cambia tan seguido
/// como la ubicación; un refetch al volver a la pantalla alcanza.
export function useFlotaPendientes(enabled = true) {
  const { isChofer } = useRoles();
  return useQuery({
    queryKey: FLOTA_PENDIENTES_KEY,
    queryFn: getMisPendientesFlota,
    enabled: enabled && isChofer,
    staleTime: 5 * 60_000,
  });
}
