import { crmClient } from './client';
import type {
  Ausencia,
  CatalogoTiposResponse,
  CrearAusenciaBody,
  ListadoAusenciasResponse,
} from '@/lib/types/ausencias';

export async function listarTiposAusencia(): Promise<CatalogoTiposResponse> {
  const { data } = await crmClient.get<CatalogoTiposResponse>('/hr/tipos-ausencia', {
    params: { all: 'true' },
  });
  return data;
}

export async function listarMisAusencias(page = 1, limit = 20): Promise<ListadoAusenciasResponse> {
  const { data } = await crmClient.get<ListadoAusenciasResponse>('/hr/ausencias/mis', {
    params: { page, limit },
  });
  return data;
}

export async function obtenerAusencia(id: number): Promise<Ausencia> {
  const { data } = await crmClient.get<Ausencia>(`/hr/ausencias/${id}`);
  return data;
}

export async function crearAusencia(body: CrearAusenciaBody, fotoUri?: string): Promise<Ausencia> {
  if (fotoUri) {
    const fd = new FormData();
    fd.append('tipoId', String(body.tipoId));
    fd.append('fechaInicio', body.fechaInicio);
    fd.append('fechaFin', body.fechaFin);
    if (body.motivo) fd.append('motivo', body.motivo);
    // RN espera el shape { uri, name, type } para archivos.
    fd.append('foto', {
      uri: fotoUri,
      type: 'image/jpeg',
      name: `ausencia-${Date.now()}.jpg`,
    } as unknown as Blob);
    const { data } = await crmClient.post<Ausencia>('/hr/ausencias', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      // La foto puede ser 2-5MB y el upload de JPEG en red móvil supera el
      // timeout global del cliente (15s).
      timeout: 60_000,
    });
    return data;
  }

  const { data } = await crmClient.post<Ausencia>('/hr/ausencias', body);
  return data;
}

export async function cancelarAusencia(id: number, comentario?: string): Promise<Ausencia> {
  const { data } = await crmClient.patch<Ausencia>(`/hr/ausencias/${id}/cancelar`, { comentario });
  return data;
}
