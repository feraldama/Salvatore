import { erpClient } from './client';
import type {
  AtencionRequeridaItem,
  CargaCombustibleResumen,
  FlotaConfig,
  FotoCaptura,
  PendienteFlota,
  TipoFotoCombustible,
  VehiculoAsignado,
  ViajeActivo,
  ViajeActivoFlota,
  ViajeFlotaDetalleMobile,
} from '@/lib/types/flota';

export async function getFlotaConfig(): Promise<FlotaConfig> {
  const { data } = await erpClient.get<FlotaConfig>('/gen/flota/config');
  return data;
}

export async function getMisVehiculos(): Promise<VehiculoAsignado[]> {
  const { data } = await erpClient.get<VehiculoAsignado[]>('/gen/flota/vehiculos/mis');
  return data;
}

export async function getMisPendientesFlota(): Promise<PendienteFlota[]> {
  const { data } = await erpClient.get<PendienteFlota[]>('/gen/flota/mantenimiento/mis-pendientes');
  return data;
}

// ── Endpoints para gerente de operaciones ──────────────────────────────────

export async function getViajesActivosFlota(): Promise<ViajeActivoFlota[]> {
  const { data } = await erpClient.get<{ viajes: ViajeActivoFlota[] }>(
    '/gen/flota/viajes/activos',
  );
  return data.viajes ?? [];
}

export async function getAtencionRequeridaFlota(): Promise<AtencionRequeridaItem[]> {
  const { data } = await erpClient.get<AtencionRequeridaItem[]>('/gen/flota/atencion-requerida');
  return data;
}

export async function getViajeFlotaDetalle(id: number): Promise<ViajeFlotaDetalleMobile> {
  const { data } = await erpClient.get<ViajeFlotaDetalleMobile>(
    `/gen/flota/viajes/detalle/${id}`,
  );
  return data;
}

export async function getViajeActivo(): Promise<{ viaje: ViajeActivo | null }> {
  const { data } = await erpClient.get<{ viaje: ViajeActivo | null }>('/gen/flota/viajes/activo');
  return data;
}

export async function iniciarViaje(input: {
  vehiculo_id: number;
  lat: number;
  lng: number;
  accuracy?: number;
}): Promise<{ id: number; inicio_en: string }> {
  const { data } = await erpClient.post('/gen/flota/viajes/iniciar', {
    vehiculo_id: input.vehiculo_id,
    lat: String(input.lat),
    lng: String(input.lng),
    accuracy: input.accuracy !== undefined ? String(input.accuracy) : undefined,
  });
  return data;
}

export async function terminarViaje(input: {
  lat: number;
  lng: number;
  accuracy?: number | null;
  capturado_en?: string;
}): Promise<{ id: number; fin_en: string }> {
  const { data } = await erpClient.post('/gen/flota/viajes/terminar', {
    lat: String(input.lat),
    lng: String(input.lng),
    accuracy:
      input.accuracy !== undefined && input.accuracy !== null
        ? String(input.accuracy)
        : undefined,
    capturado_en: input.capturado_en,
  });
  return data;
}

export async function reportarUbicacionViaje(input: {
  lat: number;
  lng: number;
  accuracy?: number | null;
  capturado_en?: string;
}): Promise<void> {
  await erpClient.post('/gen/flota/ubicacion/mobile', {
    lat: String(input.lat),
    lng: String(input.lng),
    accuracy:
      input.accuracy !== undefined && input.accuracy !== null
        ? String(input.accuracy)
        : undefined,
    capturado_en: input.capturado_en,
  });
}

export async function reportarUbicacionViajeBatch(puntos: {
  lat: number;
  lng: number;
  accuracy: number | null;
  capturado_en: string;
}[]): Promise<{ ok: true; insertados: number }> {
  const { data } = await erpClient.post<{ ok: true; insertados: number }>(
    '/gen/flota/ubicacion/mobile/batch',
    {
      puntos: puntos.map((p) => ({
        lat: String(p.lat),
        lng: String(p.lng),
        accuracy: p.accuracy !== null ? String(p.accuracy) : undefined,
        capturado_en: p.capturado_en,
      })),
    },
  );
  return data;
}

export async function getMisCargasCombustible(page = 1, limit = 20) {
  const { data } = await erpClient.get<{
    data: CargaCombustibleResumen[];
    pagination: { total: number; page: number; limit: number; totalPages: number };
  }>('/gen/flota/cargas-combustible/mis', { params: { page, limit } });
  return data;
}

export async function enviarCargaCombustible(input: {
  vehiculo_id: number;
  km_odometro?: number;
  litros?: number;
  monto?: number;
  moneda_codigo?: number;
  tablero: FotoCaptura;
  factura: FotoCaptura;
}): Promise<{ id: number; viaje_id: number }> {
  const fd = new FormData();
  fd.append('vehiculo_id', String(input.vehiculo_id));
  if (input.km_odometro !== undefined) fd.append('km_odometro', String(input.km_odometro));
  if (input.litros !== undefined) fd.append('litros', String(input.litros));
  if (input.monto !== undefined) fd.append('monto', String(input.monto));
  if (input.moneda_codigo !== undefined) fd.append('moneda_codigo', String(input.moneda_codigo));

  const fotos: { tipo: TipoFotoCombustible; cap: FotoCaptura }[] = [
    { tipo: 'tablero', cap: input.tablero },
    { tipo: 'factura', cap: input.factura },
  ];

  for (const { tipo, cap } of fotos) {
    fd.append(`${tipo}_lat`, String(cap.lat));
    fd.append(`${tipo}_lng`, String(cap.lng));
    if (cap.accuracy !== undefined) fd.append(`${tipo}_accuracy`, String(cap.accuracy));
    fd.append(`${tipo}_capturado_en`, cap.capturado_en);
    fd.append(tipo, {
      uri: cap.uri,
      type: 'image/jpeg',
      name: `${tipo}-${Date.now()}.jpg`,
    } as unknown as Blob);
  }

  const { data } = await erpClient.post<{ id: number; viaje_id: number }>(
    '/gen/flota/cargas-combustible/mobile',
    fd,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 90_000,
    },
  );
  return data;
}
