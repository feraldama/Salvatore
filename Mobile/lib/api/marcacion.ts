import { erpClient } from './client';
import type { MarcacionRegistrada, ResumenDia, TipoMarcacion } from '@/lib/types/marcacion';

export async function obtenerResumenDia(): Promise<ResumenDia> {
  const { data } = await erpClient.get<ResumenDia>('/per/marcaciones/resumen-dia');
  return data;
}

export interface EnviarMarcacionInput {
  tipo: Extract<TipoMarcacion, 'ENTRADA' | 'SALIDA'>;
  lat: number;
  lng: number;
  accuracy?: number;
  selfieUri: string;
}

export async function enviarMarcacionMobile(
  input: EnviarMarcacionInput,
): Promise<MarcacionRegistrada> {
  const fd = new FormData();
  fd.append('tipo', input.tipo);
  fd.append('lat', String(input.lat));
  fd.append('lng', String(input.lng));
  if (input.accuracy !== undefined) fd.append('accuracy', String(input.accuracy));
  // RN espera el shape { uri, name, type } para archivos en FormData.
  fd.append('selfie', {
    uri: input.selfieUri,
    type: 'image/jpeg',
    name: `selfie-${Date.now()}.jpg`,
  } as unknown as Blob);

  const { data } = await erpClient.post<MarcacionRegistrada>(
    '/per/marcaciones/mobile',
    fd,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      // Selfie + GPS en red móvil puede tardar más que el timeout global.
      timeout: 60_000,
    },
  );
  return data;
}
