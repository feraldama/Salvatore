import { useQuery } from '@tanstack/react-query';
import { getViajeActivo } from '@/lib/api/flota';
import { useRoles } from '@/lib/auth/AuthContext';

export const VIAJE_ACTIVO_KEY = ['flota', 'viaje-activo'] as const;

export function useFlotaViaje() {
  const { isChofer } = useRoles();
  const enabled = isChofer;

  return useQuery({
    queryKey: VIAJE_ACTIVO_KEY,
    queryFn: getViajeActivo,
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
