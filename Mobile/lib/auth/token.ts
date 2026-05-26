import * as SecureStore from 'expo-secure-store';

import { ES_EXPO_GO } from '@/lib/runtime';

const TOKEN_KEY = 'jwf_auth_token';
const USER_KEY = 'jwf_auth_user';

// En Expo Go el módulo nativo de SecureStore no existe — cualquier llamada
// rompe con "Cannot find native module ExpoSecureStore" y mata el bundle
// antes de que AuthProvider monte (efecto cascada: useAuth tira "debe usarse
// dentro de AuthProvider" en todas las pantallas).
//
// Fallback in-memory: la sesión NO se persiste entre reinicios — el chofer
// va a tener que loguearse de nuevo cada vez que arranque la app en Expo Go.
// Es aceptable para development; en APK release SecureStore funciona normal
// y la sesión se persiste cifrada.
const memStore = new Map<string, string>();

async function setItem(key: string, value: string): Promise<void> {
  if (ES_EXPO_GO) {
    memStore.set(key, value);
    return;
  }
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (err) {
    console.warn('[auth] SecureStore.setItemAsync falló, usando fallback memoria:', err);
    memStore.set(key, value);
  }
}

async function getItem(key: string): Promise<string | null> {
  if (ES_EXPO_GO) {
    return memStore.get(key) ?? null;
  }
  try {
    return await SecureStore.getItemAsync(key);
  } catch (err) {
    console.warn('[auth] SecureStore.getItemAsync falló, usando fallback memoria:', err);
    return memStore.get(key) ?? null;
  }
}

async function deleteItem(key: string): Promise<void> {
  if (ES_EXPO_GO) {
    memStore.delete(key);
    return;
  }
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (err) {
    console.warn('[auth] SecureStore.deleteItemAsync falló, usando fallback memoria:', err);
    memStore.delete(key);
  }
}

export async function saveToken(token: string) {
  await setItem(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  return getItem(TOKEN_KEY);
}

export async function clearToken() {
  await deleteItem(TOKEN_KEY);
}

export async function saveUser(user: unknown) {
  await setItem(USER_KEY, JSON.stringify(user));
}

export async function getUser<T = unknown>(): Promise<T | null> {
  const raw = await getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function clearUser() {
  await deleteItem(USER_KEY);
}
