import { cmsClient } from './client';
import type {
  ActualizarBody,
  CrearIncidenciaBody,
  IncidenciaDetalle,
  ListarFiltros,
  ListarResponse,
  PantallaPuntoMapa,
  PantallaResumen,
  ReasignarBody,
  TecnicoDisponible,
} from '@/lib/types/incidencias';

function paramsDeFiltros(f: ListarFiltros): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.pantallaId) out.pantallaId = f.pantallaId;
  if (f.tipo) out.tipo = f.tipo;
  if (f.abiertas !== undefined) out.abiertas = f.abiertas ? 'true' : 'false';
  if (f.asignacion) out.asignacion = f.asignacion;
  if (f.desde) out.desde = f.desde;
  if (f.hasta) out.hasta = f.hasta;
  if (f.pagina) out.pagina = String(f.pagina);
  if (f.limite) out.limite = String(f.limite);
  if (f.ordenarPor) out.ordenarPor = f.ordenarPor;
  if (f.direccion) out.direccion = f.direccion;
  return out;
}

export async function listarIncidencias(filtros: ListarFiltros): Promise<ListarResponse> {
  const { data } = await cmsClient.get<ListarResponse>('/monitoreo/incidencias', {
    params: paramsDeFiltros(filtros),
  });
  return data;
}

export async function obtenerIncidencia(id: string): Promise<IncidenciaDetalle> {
  const { data } = await cmsClient.get<IncidenciaDetalle>(`/monitoreo/incidencias/${id}`);
  return data;
}

export async function tomarIncidencia(id: string): Promise<IncidenciaDetalle> {
  const { data } = await cmsClient.post<IncidenciaDetalle>(`/monitoreo/incidencias/${id}/tomar`);
  return data;
}

export async function reasignarIncidencia(
  id: string,
  body: ReasignarBody,
): Promise<IncidenciaDetalle> {
  const { data } = await cmsClient.post<IncidenciaDetalle>(
    `/monitoreo/incidencias/${id}/reasignar`,
    body,
  );
  return data;
}

export async function listarTecnicosDisponibles(): Promise<TecnicoDisponible[]> {
  const { data } = await cmsClient.get<TecnicoDisponible[]>('/monitoreo/tecnicos');
  return data;
}

export async function actualizarIncidencia(
  id: string,
  body: ActualizarBody,
  fotoUri?: string,
): Promise<IncidenciaDetalle> {
  // Si hay foto, mandamos multipart/form-data — el backend (PATCH) acepta
  // tanto JSON como multipart gracias a multer.single('foto').
  if (fotoUri) {
    const fd = new FormData();
    if (body.notasResolucion !== undefined) fd.append('notasResolucion', body.notasResolucion);
    if (body.resolver !== undefined) fd.append('resolver', String(body.resolver));
    // RN espera el shape { uri, name, type } para archivos.
    fd.append('foto', {
      uri: fotoUri,
      type: 'image/jpeg',
      name: `reparacion-${id}.jpg`,
    } as unknown as Blob);
    const { data } = await cmsClient.patch<IncidenciaDetalle>(
      `/monitoreo/incidencias/${id}`,
      fd,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        // Subir JPEG de cámara (2-5MB) en red móvil puede tardar más que el
        // timeout global del cliente (15s). Le damos margen razonable para
        // que no falle el primer intento por timeout.
        timeout: 60_000,
      },
    );
    return data;
  }

  const { data } = await cmsClient.patch<IncidenciaDetalle>(
    `/monitoreo/incidencias/${id}`,
    body,
  );
  return data;
}

export async function crearIncidencia(body: CrearIncidenciaBody): Promise<IncidenciaDetalle> {
  const { data } = await cmsClient.post<IncidenciaDetalle>('/monitoreo/incidencias', body);
  return data;
}

export async function listarPantallasParaIncidencia(): Promise<PantallaResumen[]> {
  const { data } = await cmsClient.get<PantallaResumen[]>('/monitoreo/pantallas');
  return data;
}

export async function listarPantallasParaMapa(): Promise<PantallaPuntoMapa[]> {
  const { data } = await cmsClient.get<PantallaPuntoMapa[]>('/monitoreo/pantallas/mapa');
  return data;
}

export interface ReproducirDiagnosticoResponse {
  id: string;
  pantallaId: string;
  tipo: string;
  estado: string;
  payload: { url?: string; durationSec?: number; nombre?: string } | null;
  creadoEn: string;
}

export async function reproducirDiagnostico(
  incidenciaId: string,
): Promise<ReproducirDiagnosticoResponse> {
  const { data } = await cmsClient.post<ReproducirDiagnosticoResponse>(
    `/monitoreo/incidencias/${incidenciaId}/diagnostico`,
  );
  return data;
}
