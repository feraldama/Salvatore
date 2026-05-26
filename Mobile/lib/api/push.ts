import { cmsClient } from './client';

export async function registrarPushToken(
  expoPushToken: string,
  plataforma: 'ios' | 'android' | 'web',
): Promise<void> {
  await cmsClient.post('/monitoreo/push/registrar', { expoPushToken, plataforma });
}

export async function desregistrarPushToken(expoPushToken: string): Promise<void> {
  await cmsClient.delete('/monitoreo/push/registrar', { data: { expoPushToken } });
}
