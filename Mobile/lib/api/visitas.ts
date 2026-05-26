import { crmClient } from './client';

export interface EmpresaVisita {
  id: number;
  nombre: string | null;
  direccion: string | null;
  latitud: number | null;
  longitud: number | null;
}

export interface AsistenciaVisita {
  id: number;
  pendiente: boolean;
}

export type EstadoVisita = 'agendada' | 'en_curso' | 'completada' | 'no_realizada';

export interface Visita {
  id: number;
  asunto: string;
  descripcion: string | null;
  fechaInicio: string;
  estado: EstadoVisita;
  horaInicioReal: string | null;
  horaFinReal: string | null;
  empresa: EmpresaVisita | null;
  asistencia: AsistenciaVisita | null;
}

export interface AgendaHoyConfig {
  horaEntrada: string;
  ventanaMin: number;
  radioMetros: number;
}

export interface AgendaHoyResponse {
  visitas: Visita[];
  config: AgendaHoyConfig;
}

export async function getAgendaHoy(): Promise<AgendaHoyResponse> {
  const { data } = await crmClient.get<AgendaHoyResponse>('/crm/visitas/agenda/hoy');
  return data;
}

export async function checkInCamino(visitaId: number) {
  const { data } = await crmClient.post(`/crm/visitas/${visitaId}/check-in`);
  return data;
}

export async function iniciarVisita(visitaId: number, lat: number, lng: number) {
  const { data } = await crmClient.post(`/crm/visitas/${visitaId}/iniciar`, { lat, lng });
  return data;
}

export async function finalizarVisita(
  visitaId: number,
  lat: number,
  lng: number,
  resultado?: string
) {
  const { data } = await crmClient.post(`/crm/visitas/${visitaId}/finalizar`, {
    lat,
    lng,
    resultado,
  });
  return data;
}
