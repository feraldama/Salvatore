import { config } from '@/lib/config';

// El backend devuelve frame_evidencia_url como `/uploads/monitoreo/<file>.jpg`.
// El static está montado en el root del backend, no bajo /api. Construimos
// la URL absoluta quitando ese sufijo.
export function cmsAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = config.cmsApiUrl.replace(/\/api\/?$/, '');
  if (!base) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}
