import { config } from '@/lib/config';

// El backend del CRM devuelve URLs relativas tipo `/uploads/hr-ausencias/<uuid>.jpg`.
// El static está montado en el root del backend, no bajo /api.
export function crmAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = config.crmApiUrl.replace(/\/api\/?$/, '');
  if (!base) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}
