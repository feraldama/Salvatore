import axios, { AxiosError, AxiosInstance } from 'axios';
import { config } from '@/lib/config';
import { clearToken, clearUser, getToken } from '@/lib/auth/token';

let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

function attachInterceptors(client: AxiosInstance) {
  client.interceptors.request.use(async (req) => {
    const token = await getToken();
    if (token) {
      req.headers.Authorization = `Bearer ${token}`;
    }
    return req;
  });

  client.interceptors.response.use(
    (res) => res,
    async (error: AxiosError) => {
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        await clearToken();
        await clearUser();
        onUnauthorized?.();
      }
      return Promise.reject(error);
    }
  );
}

export const erpClient = axios.create({
  baseURL: config.erpApiUrl,
  timeout: 15000,
});
attachInterceptors(erpClient);

export const cmsClient = axios.create({
  baseURL: config.cmsApiUrl,
  timeout: 15000,
});
attachInterceptors(cmsClient);

export const crmClient = axios.create({
  baseURL: config.crmApiUrl || undefined,
  timeout: 15000,
});
attachInterceptors(crmClient);

crmClient.interceptors.request.use((req) => {
  if (!config.crmApiUrl) {
    return Promise.reject(
      new Error('EXPO_PUBLIC_CRM_API_URL no está configurada (módulo ausencias / CRM / visitas).'),
    );
  }
  return req;
});
