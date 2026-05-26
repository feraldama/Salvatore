import { cmsClient } from './client';

export interface UbicacionInput {
  latitud: number;
  longitud: number;
  exactitudM?: number;
}

export async function reportarUbicacion(input: UbicacionInput): Promise<void> {
  await cmsClient.post('/monitoreo/ubicacion', input);
}
