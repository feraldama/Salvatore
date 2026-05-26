import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  checkInCamino,
  finalizarVisita,
  getAgendaHoy,
  iniciarVisita,
} from '@/lib/api/visitas';

const KEY_AGENDA = 'visitas-agenda-hoy' as const;

export function useAgendaHoy(enabled: boolean) {
  return useQuery({
    queryKey: [KEY_AGENDA],
    queryFn: getAgendaHoy,
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,        // polling para captar visitas nuevas cargadas en el CRM durante el día
    refetchOnReconnect: true,
    refetchOnMount: 'always',
  });
}

export function useCheckInCamino() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (visitaId: number) => checkInCamino(visitaId),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY_AGENDA] }),
  });
}

export function useIniciarVisita() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ visitaId, lat, lng }: { visitaId: number; lat: number; lng: number }) =>
      iniciarVisita(visitaId, lat, lng),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY_AGENDA] }),
  });
}

export function useFinalizarVisita() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      visitaId,
      lat,
      lng,
      resultado,
    }: {
      visitaId: number;
      lat: number;
      lng: number;
      resultado?: string;
    }) => finalizarVisita(visitaId, lat, lng, resultado),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY_AGENDA] }),
  });
}
