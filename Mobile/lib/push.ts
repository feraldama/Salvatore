// API pública del módulo de push. Toda la lógica real vive en `push-impl.ts`;
// este archivo se limita a detectar Expo Go y, si NO lo es, hacer dynamic
// import del impl. En Expo Go los métodos son no-op.
//
// Motivo: desde SDK 53 expo-notifications rompe al sólo evaluar su index.js
// dentro de Expo Go (warnOfExpoGoPushUsage tira, no warnea). Si lo
// importáramos top-level, la app entera dejaría de bootear en Expo Go.

import Constants, { ExecutionEnvironment } from 'expo-constants';

const ES_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export async function configurarHandlerForeground(): Promise<void> {
  if (ES_EXPO_GO) return;
  const mod = await import('./push-impl');
  await mod.configurarHandlerForegroundImpl();
}

export async function registrarseParaPush(): Promise<string | null> {
  if (ES_EXPO_GO) return null;
  const mod = await import('./push-impl');
  return mod.registrarseParaPushImpl();
}

// El deep-link de "tap notificación → /incidencia/[id]" lo maneja expo-router
// automáticamente cuando la notif lleva `data.url` con scheme+path. No
// exponemos helpers manuales porque registrar nuestro listener entra en
// conflicto con el linking interno de expo-router.
