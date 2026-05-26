import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelarAusencia,
  crearAusencia,
  listarMisAusencias,
  listarTiposAusencia,
  obtenerAusencia,
} from '@/lib/api/ausencias';
import type { CrearAusenciaBody } from '@/lib/types/ausencias';

const KEY_TIPOS  = 'hr-tipos-ausencia' as const;
const KEY_MIS    = 'hr-mis-ausencias' as const;
const KEY_DETAIL = 'hr-ausencia-detalle' as const;

export function useTiposAusencia() {
  return useQuery({
    queryKey: [KEY_TIPOS],
    queryFn: listarTiposAusencia,
    staleTime: 5 * 60_000, // catálogo cambia rara vez
  });
}

export function useMisAusencias() {
  return useQuery({
    queryKey: [KEY_MIS],
    queryFn: () => listarMisAusencias(1, 50),
    staleTime: 15_000,
    refetchOnMount: 'always',
  });
}

export function useAusencia(id: number | null) {
  return useQuery({
    queryKey: [KEY_DETAIL, id],
    queryFn: () => obtenerAusencia(id as number),
    enabled: !!id,
    staleTime: 5_000,
  });
}

export function useCrearAusencia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body, fotoUri }: { body: CrearAusenciaBody; fotoUri?: string }) =>
      crearAusencia(body, fotoUri),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY_MIS] }),
  });
}

export function useCancelarAusencia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, comentario }: { id: number; comentario?: string }) =>
      cancelarAusencia(id, comentario),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: [KEY_MIS] });
      qc.setQueryData([KEY_DETAIL, data.ID], data);
    },
  });
}
