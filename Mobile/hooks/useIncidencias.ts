import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  actualizarIncidencia,
  crearIncidencia,
  listarIncidencias,
  listarPantallasParaIncidencia,
  listarPantallasParaMapa,
  listarTecnicosDisponibles,
  obtenerIncidencia,
  reasignarIncidencia,
  reproducirDiagnostico,
  tomarIncidencia,
} from '@/lib/api/incidencias';
import type {
  ActualizarBody,
  CrearIncidenciaBody,
  ListarFiltros,
  ReasignarBody,
} from '@/lib/types/incidencias';

const KEY_LISTA = 'incidencias' as const;
const KEY_DETALLE = 'incidencia' as const;
const KEY_PANTALLAS = 'monitoreo-pantallas' as const;
const KEY_TECNICOS = 'monitoreo-tecnicos' as const;

export function useIncidencias(filtros: ListarFiltros) {
  return useQuery({
    queryKey: [KEY_LISTA, filtros],
    queryFn: () => listarIncidencias(filtros),
    staleTime: 5_000,
    refetchInterval: 15_000,            // polling para detectar nuevas incidencias / auto-cierres
    refetchOnReconnect: true,
    refetchOnMount: 'always',
  });
}

/// Contador de incidencias "mías abiertas" para el badge de la tab. Reusa
/// el endpoint del listado con limite=1 (solo nos interesa `total`). Polling
/// 30s para no duplicar el del listado pero seguir reflejando auto-asignaciones
/// nuevas sin que el técnico abra la tab.
export function useIncidenciasMiasCount(enabled: boolean) {
  return useQuery({
    queryKey: [KEY_LISTA, 'mias-count'],
    queryFn: () => listarIncidencias({ asignacion: 'mias', abiertas: true, limite: 1 }),
    enabled,
    select: (data) => data.total,
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchOnReconnect: true,
  });
}

export function useIncidencia(id: string | null | undefined) {
  return useQuery({
    queryKey: [KEY_DETALLE, id],
    queryFn: () => obtenerIncidencia(id as string),
    enabled: !!id,
    staleTime: 5_000,
    refetchInterval: 10_000,            // detalle: polling más rápido para ver auto-cierre o cambios
    refetchOnReconnect: true,
    refetchOnMount: 'always',
  });
}

export function useTomarIncidencia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tomarIncidencia(id),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: [KEY_LISTA] });
      qc.setQueryData([KEY_DETALLE, data.id], data);
    },
  });
}

export function useActualizarIncidencia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body, fotoUri }: { id: string; body: ActualizarBody; fotoUri?: string }) =>
      actualizarIncidencia(id, body, fotoUri),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: [KEY_LISTA] });
      qc.setQueryData([KEY_DETALLE, data.id], data);
    },
  });
}

export function useCrearIncidencia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CrearIncidenciaBody) => crearIncidencia(body),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: [KEY_LISTA] });
      qc.setQueryData([KEY_DETALLE, data.id], data);
    },
  });
}

export function usePantallasParaIncidencia() {
  return useQuery({
    queryKey: [KEY_PANTALLAS],
    queryFn: listarPantallasParaIncidencia,
    staleTime: 5 * 60_000,        // pantallas cambian poco; cachear 5 min
  });
}

export function useReproducirDiagnostico() {
  return useMutation({
    mutationFn: (incidenciaId: string) => reproducirDiagnostico(incidenciaId),
  });
}

export function useReasignarIncidencia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ReasignarBody }) =>
      reasignarIncidencia(id, body),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: [KEY_LISTA] });
      qc.setQueryData([KEY_DETALLE, data.id], data);
    },
  });
}

export function usePantallasMapa(enabled: boolean) {
  return useQuery({
    queryKey: ['monitoreo-mapa'],
    queryFn: listarPantallasParaMapa,
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useTecnicosDisponibles(enabled: boolean) {
  return useQuery({
    queryKey: [KEY_TECNICOS],
    queryFn: listarTecnicosDisponibles,
    enabled,
    staleTime: 60_000,
  });
}
